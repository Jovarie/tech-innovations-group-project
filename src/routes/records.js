const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const rbacMiddleware = require('../middleware/rbacMiddleware');
const recordsController = require('../controllers/recordsController');

router.get('/records', authRequired, rbacMiddleware.checkPermission('read_record'), recordsController.getAllRecords);

module.exports = router;
