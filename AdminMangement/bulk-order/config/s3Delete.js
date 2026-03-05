const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { S3Client } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const deleteFromS3 = async (keys = []) => {
  try {
    for (const key of keys) {
      const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
      });

      await s3.send(command);
      console.log("Deleted from S3:", key);
    }
  } catch (error) {
    console.error("S3 Delete Error:", error);
  }
};

module.exports = deleteFromS3;