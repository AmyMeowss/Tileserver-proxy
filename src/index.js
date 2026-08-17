const express = require('express');
const app = express();
const port = 3000;

app.get('/tiles/:z/:x/:y.png', (req, res) => {

    let { z, x, y } = req.params;

    z = parseInt(z);
    x = parseInt(x);
    y = parseInt(y);

    let key = `${z}/${x}/${y}`;

    res.send(`Hello ${z}/${x}/${y} !`);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});