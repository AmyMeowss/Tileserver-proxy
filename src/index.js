const express = require('express');
const fs = require('fs');
const path = require('path');
const superagent = require('superagent');
const app = express();
const port = 3000;

const bullmq = require('bullmq');
const IORedis = require('ioredis');
const connection = new IORedis({ maxRetriesPerRequest: null });

const Queue = new bullmq.Queue('tiles', { connection });
const queueEvents = new bullmq.QueueEvents('tiles', { connection });

let times = [];

// TODO: add mongoose DB
// TODO: add env vars

const CacheDir = path.join(process.cwd(), 'cache');
if (!fs.existsSync(CacheDir)) {
    fs.mkdirSync(CacheDir);
}

const TILESERVER_URL = 'http://localhost:8080';
const TILESERVER_STYLE = 'liberty';

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
})

app.get('/tiles/:z/:x/:y.png', async (req, res) => {

    let { z, x, y } = req.params;

    z = parseInt(z);
    x = parseInt(x);
    y = parseInt(y);

    let key = `${z}-${x}-${y}`;
    let tilePath = path.join(CacheDir, `${key}.png`);

    if (fs.existsSync(tilePath)) {
        res.header('X-Cache', 'HIT');
        res.sendFile(tilePath);
        return;
    }

    let Start = Date.now();
    // console.log('creating job...');
    let job = await Queue.add('tiles', {
        z, x, y
    },
        {
            removeOnComplete: true,
            removeOnFail: true,
            priority: 10,
            attempts: 3,
            backoff: {
                type: 'fixed',
                delay: 1000,
            },
            deduplication: { id: key }
        }
    );

    // sendStats();

    // console.log('waiting...', Date.now()-Start);
    await job.waitUntilFinished(queueEvents);

    let Time = Date.now() - Start;
    times.push(Time);
    if (times.length > 1000) {
        let toRemove = times.length - 1000;
        for(let i = 0; i<toRemove; i++) {
            times.pop();
        }
    }
    // console.log(`Tile ${z}/${x}/${y} took ${Time} ms to render!`);

    res.header('X-Cache', 'MISS');
    res.sendFile(tilePath);

    // sendStats();
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

const worker = new bullmq.Worker(
    'tiles',
    async (job) => {
        let { x, y, z } = job.data;

        let key = `${z}-${x}-${y}`;
        let tilePath = path.join(CacheDir, `${key}.png`);

        let tileUrl = `${TILESERVER_URL}/styles/${TILESERVER_STYLE}/256/${z}/${x}/${y}.png`;

        let result = await superagent.get(tileUrl).retry(3);

        if (result.status != 200) {
            console.error(result.body);
            return Error('Tile failed to render');
        }

        fs.writeFileSync(tilePath, result.body);

        return tilePath;
    },
    {
        connection,
        concurrency: 1
    }
);

async function sendStats() {
    const { active, completed, failed, prioritized, waiting } = await Queue.getJobCounts();
    if (prioritized == 0 && waiting == 0) return;

    const Average = array => array.reduce((a, b) => a + b) / array.length;

    let average = -1;
    if (times.length > 1) {
        average = Average(times);
        average = Math.round(average);
    }

    console.log(`[STATUS] ${active} processing | ${prioritized} in queue [ ${failed} failed ] | ${average*prioritized} ms eta | ${average} ms per job`);
}

queueEvents.on('active', sendStats);
queueEvents.on('completed', sendStats);