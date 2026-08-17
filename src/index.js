const express = require('express');
const fs = require('fs');
const path = require('path');
const superagent = require('superagent');
const app = express();
const port = 3000;

// TODO: add mongoose DB
// TODO: add env vars

const CacheDir = path.join(process.cwd(), 'cache');
if (!fs.existsSync(CacheDir)) {
    fs.mkdirSync(CacheDir);
}

const TILESERVER_URL = 'http://localhost:8080';
const TILESERVER_STYLE = 'liberty';

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

    let tileUrl = `${TILESERVER_URL}/styles/${TILESERVER_STYLE}/256/${z}/${x}/${y}.png`;

    let result = await superagent.get(tileUrl).retry(3);

    if (result.status != 200) {
        console.error(result.body);
        res.header('X-Cache', 'ERROR');
        res.status(500).type('txt').send(`Tile failed to render...`);
    }

    fs.writeFileSync(tilePath, result.body);

    res.header('X-Cache', 'MISS');
    res.type('png').send(result.body);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});