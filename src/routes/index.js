const express = require('express');
const presets = require('./presets');
const deploy = require('./deploy');
const renew = require('./renew');
const admin = require('./admin');

const router = express.Router();

router.use(presets);
router.use(deploy);
router.use(renew);
router.use(admin);

module.exports = router;
