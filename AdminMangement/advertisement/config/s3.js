const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
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

// FILE FILTER
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only images allowed"), false);
  }
};

// MULTER UPLOAD
const upload = multer({
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (req, file, cb) => {
      cb(
        null,
        `advertisement/${Date.now()}-${file.originalname}`
      );
    },
  }),
});

// DELETE FUNCTION
async function deleteFromS3(key) {

  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  });

  return await s3.send(command);
}

console.log({
  upload,
  deleteFromS3
});

module.exports = {
  upload,
  deleteFromS3,
};