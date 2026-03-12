const { S3Client } = require("@aws-sdk/client-s3");
const multer = require("multer");
const multerS3 = require("multer-s3");
require("dotenv").config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

// only images allowed
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only images allowed"), false);
  }
};

const upload = multer({
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },

  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BULK_ORDER_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (req, file, cb) => {
      const key = `tiffin/${Date.now()}-${file.originalname}`;
      cb(null, key);
    },
  }),
});

module.exports = upload;