/*let Throng = require('throng');
let Queue = require("bull");
const { ClassyManager, DatabaseManager, ModelManager, UtilityManager } = require('./app/manager');
const { ClassyQueue } = require('./app/queue')

// Spin up multiple processes to handle jobs to take advantage of more CPU cores
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
let workers = process.env.WEB_CONCURRENCY;

// The maximum number of jobs each worker should process at once. This will need
// to be tuned for your application. If each job is mostly waiting on network
// responses it can be much higher. If each job is CPU-intensive, it might need
// to be much lower.
let maxJobsPerWorker = 30;

async function start()
{
  console.log('Worker starting');

  const dbMgr = await DatabaseManager.Init();
  const modelMgr = await ModelManager.Init();
  const utilityMgr = UtilityManager.Init(modelMgr.getModel('pushtoken'));
  const classyMgr = ClassyManager.GetInstance(modelMgr, utilityMgr);

  ClassyQueue.process(async (job) =>
  {
    console.log('Worker processing ' + job.id + ' with job name: ' + job.data.jobName + '\nMax threads: ' + workers);

    if(job.data.jobName === 'calculate-totals')
    {
		  await classyMgr.calculateTotalRaised(job);
    }
    else if(job.data.jobName === 'members')
    {
		  await classyMgr.getMembers(job);
    }
    else if(job.data.jobName === 'teams')
    {
		  await classyMgr.getTeams(job);
    }
    else if(job.data.jobName === 'tickets')
    {
		  await classyMgr.getTickets(job);
    }
    else if(job.data.jobName === 'update-teams')
    {
		  await classyMgr.updateTeams(job);
    }
    else if(job.data.jobName === 'update-answers')
    {
      await classyMgr.updateAnswers(job);
    }
    else if(job.data.jobName === 'all')
    {
      await classyMgr.all(job);
    }
  });
}

// Initialize the clustered worker process
// See: https://devcenter.heroku.com/articles/node-concurrency for more info
Throng({ count: workers, worker: start });*/
