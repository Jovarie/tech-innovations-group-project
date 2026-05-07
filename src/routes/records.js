const express = require('express');
const router = express.Router();
const rbacMiddleware = require('../middleware/rbacMiddleware');
const recordsController = require('../controllers/recordsController');

router.get('/records', rbacMiddleware.checkPermission('read_record'), recordsController.getAllRecords);

module.exports = router;
