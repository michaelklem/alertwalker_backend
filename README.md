Install
====
- AWS Permissions Required
  - https://console.aws.amazon.com/iam/
  ```json
  {
    "Version": "2012-10-17",
    "Statement":
    [
      {
          "Sid": "PINPOINT",
          "Effect": "Allow",
          "Action": [
            "mobiletargeting:CreateApp",
            "mobiletargeting:GetApps",
            "mobiletargeting:SendMessages",
            "mobiletargeting:UpdateApnsSandboxChannel",
            "mobiletargeting:UpdateApnsChannel",
            "mobiletargeting:UpdateGcmChannel"
          ],
          "Resource": "*"
      },
      {
          "Sid": "S3",
          "Effect": "Allow",
          "Action": "s3:*",
          "Resource": "*"
      },
      {
          "Sid": "SES",
          "Effect": "Allow",
          "Action": [
              "ses:*"
          ],
          "Resource": "*"
      },
      {
          "Sid": "SNS",
          "Effect": "Allow",
          "Action": "sns:Publish",
          "Resource": "*"
      }
    ]
  }
  ```
  - Replace Environment variables for AWS_SECRET_ACCESS_KEY and AWS_ACCESS_KEY_ID with new keys for this user

  - [![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/tgreco/alert-walker-backend)
