const express = require('express');
const banController = require('../controllers/banController');

const router = express.Router();

router.get('/', banController.index);
router.post('/apelar', banController.apelar);

module.exports = router;
