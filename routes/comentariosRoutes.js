const express = require('express');
const router = express.Router();
const comentarioController = require('../controllers/comentarioController');

router.post('/:id/like', comentarioController.like);
router.delete('/:id', comentarioController.destroy);

module.exports = router;
