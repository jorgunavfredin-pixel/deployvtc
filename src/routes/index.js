const express = require('express');
const presets = require('./presets');
const deploy = require('./deploy');
const renew = require('./renew');
const manage = require('./manage');

const router = express.Router();

router.use(presets);
router.use(deploy);
router.use(renew);
router.use(manage);

module.exports = router;
