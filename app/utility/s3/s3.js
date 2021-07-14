const Aws         = require('aws-sdk');
const Environment = require('../../environment');
const ShortId     = require('../../extension/shortId');
const FileType    = require('file-type');
// TODO: Figure out why this has a ciruclar depedency
//const {Log}			= require('../../model');
const ReadFile    = require('fs-readfile-promise');


/**
  Responsible for handling S3 interactions
*/
class S3
{
  static S3Regions = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ap-east-1', 'af-south-1',
    'ap-south-1', 'ap-northeast-3', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ca-central-1',
  'cn-north-1', 'cn-northwest-1', 'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-south-1', 'eu-west-3', 'eu-north-1', 'sa-east-1'];

  static async CreateBucket(bucketName)
  {
    try
    {
      const config =
      {
        accessKeyId: Environment.AWS_ACCESS_KEY_ID,
        secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY,
        region: Environment.AWS_S3_REGION
      };
      const s3BucketParams =
      {
        Bucket: bucketName,
        ACL: 'public-read'
      };
      const s3StaticHostParms =
      {
        Bucket: bucketName,
        WebsiteConfiguration:
        {
          ErrorDocument: { Key: 'index.html'},
          IndexDocument: { Suffix: 'index.html' },
        }
      };
      const s3 = new Aws.S3(config);
      let s3Result = await s3.createBucket(s3BucketParams).promise();
      s3Result = await s3.putBucketWebsite(s3StaticHostParms).promise();

      //Log.Info(__filename, 'S3 created bucket: ' + bucketName);

      return 'http://' + bucketName + '.s3-website-' + Environment.AWS_S3_REGION + '.amazonaws.com';
    }
    catch(err)
    {
      console.log(err.stack);
      throw err;
    }
  }

  /**
    Delete file from S3 bucket by key
    @param  {String}  key   Key of file (path)
    @param  {String}  bucket  Bucket to remove file from
    @returns {Bool} true on success/false on error
  */
  static async Delete(key, bucket)
  {
    const config =
    {
      accessKeyId: Environment.AWS_ACCESS_KEY_ID,
      secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY,
      region: Environment.AWS_S3_REGION
    };
    const s3Params =
    {
      Bucket: bucket,
      Key: `${key}`
    };
    const s3Result = await new Aws.S3(config).deleteObject(s3Params).promise();
    console.log(s3Result);
    //Log.Info(__filename, 'S3 delete by: ' + userId + ' File: ' + key);

    return true;
  }

  /**
    Delete multiple files from S3 bucket by key
    @param  {Array.<String>}  keys   Array of keys to remove
    @param  {String}  bucket  Bucket to remove file from
    @returns {Bool} true on success/false on error
  */
  static async DeleteMany(keys, bucket)
  {
    try
    {
      const cleanKeys = [...keys];
      for(let i = 0; i < cleanKeys.length; i++)
      {
        cleanKeys[i] = {Key: cleanKeys[i].substr(cleanKeys[i].indexOf(Config.AWS_S3_BUCKET) + Config.AWS_S3_BUCKET.length, cleanKeys[i].length)};
      }

      const config =
      {
        accessKeyId: Environment.AWS_ACCESS_KEY_ID,
        secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY,
        region: Environment.AWS_S3_REGION
      };
      const s3Params =
      {
        Bucket: bucket,
        Delete:
        {
          Objects: cleanKeys
        }
      };
      const s3Result = await new Aws.S3(config).deleteObjects(s3Params).promise();

      //Log.Info(__filename, 'S3 deleteMany. Files: ' + cleanKeys.toString());

      return true;
    }
    catch(err)
    {
      console.log(err.stack);
      return false;
    }
  }

  /**
    Upload file to S3 at given path
    @param  {Object}  file    File to upload
    @param  {String}  userId   User uploading
    @param  {String}  model    Model this upload belongs to
    @param  {String}  field    Field in model this is for
    @param  {String}  bucket  Bucket to upload file to
    @param  {String}  oldPath   URL where old file is stored to delete (null means skip)
    @returns {String} URL where file is acessible
    Path example:  /uploads/{user._id}/{model.name}/{field}{datetime}.{file_extension}
  */
  static async Upload(file, userId, model, field, bucket, oldFile = null)
  {
    try
    {
      // Process file
      const buffer = await ReadFile(file.path);
      const type = FileType(buffer);

      if(!type)
      {
        throw new Error('Unsupported file type');
      }

      // Build path
      const path = 'uploads/' + ShortId(userId) + '/' + model + '/' + field + '_' + new Date().toISOString() + '.' + type.ext;
      // TODO: Add option to remove previous field value so we don't have dead space on S3 storage
      // Upload
      const config =
      {
        accessKeyId: Environment.AWS_ACCESS_KEY_ID,
        secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY,
        region: Environment.AWS_S3_REGION
      };
      const s3Params =
      {
        ACL: 'public-read',
        Body: buffer,
        Bucket: bucket,
        ContentType: type.mime,
        Key: `${path}`
      };

      const s3Result = await new Aws.S3(config).upload(s3Params).promise();
      //Log.Info(__filename, 'S3 upload by: ' + userId + ' Path: ' + s3Result.Location);

      if(oldFile !== null)
      {
        await S3.Delete(oldFile, bucket);
      }

      return s3Result.Location;
    }
    catch(err)
    {
      throw err;
    }
  }


  /**
    Upload json to S3 at given path
    @param  {Object}  data    Data to upload
    @param  {String}  path   Path uploading to
    @param  {String}  contentType   Content type parameter for s3 putObject. Ex: application/json
    @param  {String}  bucket  Bucket to remove file from
    @param  {String}  acl    Access control list
    @returns {String} URL where file is acessible
    Path example:  /uploads/{user._id}/{model.name}/{field}{datetime}.{file_extension}
  */
  static async UploadData(data, path, contentType, bucket, acl = 'authenticated-read')
  {
    try
    {
      // Upload
      const config =
      {
        accessKeyId: Environment.AWS_ACCESS_KEY_ID,
        secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY,
        region: Environment.AWS_S3_REGION
      };
      const s3Params =
      {
        ACL: acl,
        Body: data,
        Bucket: bucket,
        ContentType: contentType,
        Key: `${path}`
      };
      const s3Result = await new Aws.S3(config).putObject(s3Params).promise();
      //Log.Info(__filename, 'S3 upload by system Path: ' + path);
      return s3Result;
    }
    catch(err)
    {
      throw err;
    }
  }

  /**
    Read S3 file
    @param  {Object}  path    Path to retrieve
    @param  {String}  bucket  Bucket to remove file from
    @returns {File} File
  */
  static async GetFile(path, bucket)
  {
    try
    {
      // Upload
      const config =
      {
        accessKeyId: Environment.AWS_ACCESS_KEY_ID,
        secretAccessKey: Environment.AWS_SECRET_ACCESS_KEY,
        region: Environment.AWS_S3_REGION
      };
      const s3Params =
      {
        Bucket: bucket,
        Key: `${path}`
      };
      const s3Result = await new Aws.S3(config).getObject(s3Params).promise();
      return s3Result;
    }
    catch(err)
    {
      throw err;
    }
  }
}


module.exports = S3;
