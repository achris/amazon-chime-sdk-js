#!/usr/bin/env node

require('dotenv').config({path: __dirname + '../.env'});
const { argv, env, kill, exit } = require('process');
const { runSync, runAsync } = require('../utils/HelperFunctions');
const args = require('minimist')(argv.slice(2));
const path = require('path');
const fs = require('fs');
const { Logger, LogLevel } = require('../utils/Logger');

const pathToIntegrationFolder = path.resolve(__dirname, '../tests');
const pathToTestDemoFolder = path.resolve(__dirname, '../../../demos/browser');
const pathToConfigsFolder = path.resolve(__dirname, '../configs');

let testSuite = 'all';
let testType = 'integration-test';
let testConfigs = [];
let host = 'local';
let logger;

const setupLogger = () => {
  logger = new Logger('Test Runner (run-test)');
  logger.log('Logger setup finished');
}

const usage = () => {
  console.log(`Usage: run-test -- [-t test] [-h host] [-tt test-type]`);
  console.log(`  -t, --test                    Target test suite [default: all]`);
  console.log(`  -h, --host                    WebDriver server [default: local]`);
  console.log(`  -tt, --test-type              Test type [default: integration-test]`);
  console.log(`Values:`);
  console.log(`  -t, --test`);
  console.log(`    all: ../tests/*`);
  console.log(`    audio: ../tests/AudioTest.js`);
  console.log(`    video: ../tests/VideoTest.js\n`);
  console.log(`  -h, --host`);
  console.log(`    local: Run tests locally`);
  console.log(`    saucelabs: Run tests on SauceLabs\n`);
  console.log(`  -tt, --test-type`);
  console.log(`    integration-test: Run integration test`);
  console.log(`    browser-compatibility: Run browser compatibility test\n`);
};

const parseArgs = () => {
  for (const [key, value] of Object.entries(args)) {
    if (key === '_') continue;
    switch (key) {
      case 'help':
        usage();
        exit(0);

      case 't': case 'test':
        testSuite = value;
        break;

      case 'h': case 'host':
        host = value;
        process.env.HOST = value;
        break;

      case 'tt': case 'test-type':
        process.env.TEST_TYPE = value;
        testType = value;
        break;

      default:
        logger.log(`Invalid argument ${key}`, LogLevel.ERROR);
        usage();
        exit(1);
    }
  }

  return {
    testSuite,
    host,
    testType
  };
};

const settestTargets = (testSuite, testType) => {
  if(testType === 'browser-compatibility') {
    switch (testSuite) {
      case 'all':
        testConfigs = [
          'browserCompatibilityTest/desktop/audio_test.config.json',
          'browserCompatibilityTest/desktop/video_test.config.json'
        ];
        break;
      
      case 'audio':
        testConfigs = [
          'browserCompatibilityTest/desktop/audio_test.config.json'
        ];
        break;
      
      case 'video':
        testConfigs = [
          'browserCompatibilityTest/desktop/video_test.config.json'
        ];
        break;
  
      default:
        testConfigs = [
          'browserCompatibilityTest/desktop/audio_test.config.json',
          'browserCompatibilityTest/desktop/video_test.config.json'
        ];
        break;
    }
  }
};

const checkIfPortIsInUse = async port =>
  new Promise(resolve => {
    const server = require('http')
      .createServer()
      .listen(port, 'localhost', () => {
        server.close();
        resolve(false);
      })
      .on('error', () => {
        resolve(true);
      });
  });

function startTestDemo() {
  logger.log('Installing dependencies in test demo');
  runSync('npm', ['install'], { cwd: pathToTestDemoFolder });

  logger.log('Starting the test demo');
  // The test demo will keep running until the process is terminated,
  // so we should execute this command asynchronously without blocking other commands.
  runAsync('npm', ['run', 'start'], { cwd: pathToTestDemoFolder });
}

const waitUntilTestDemoStarts = async () => {
  logger.log('Waiting for test demo to start');
  count = 0;
  threshold = 60;

  while (count < 60) {
    const isInUse = await checkIfPortIsInUse(9000);
    if (isInUse === true) {
      logger.log('Test demo has started successfully');
      return;
    }
    count += 1;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  logger.log('Test demo did not start successfully', LogLevel.ERROR);
  terminateTestDemo(pid);
  exit(1);
};

const startTesting = (testSuite, testType) => {
  logger.log('Running test');
  let tests;
  let clients;

  if(testType === 'browser-compatibility')  {
    for(const testConfig of testConfigs)  {
      let testConfigRaw = fs.readFileSync(path.resolve(pathToConfigsFolder, testConfig));
      let testConfigJSON = JSON.parse(testConfigRaw);
      tests = testConfigJSON.tests;
      clients = testConfigJSON.clients;
      runTest(tests, clients);
    }
  }
  else  {
    switch(testSuite) {
      case 'audio':
        tests = [
          {
            name: 'Audio Test',
            testImpl: 'AudioTest.js'
          }
        ]
        break;
    }
    clients = [
      {
        browserName: "chrome",
        browserVersion: "latest",
        platform: "MAC"
      }
    ];
    runTest(tests, clients);
  }
};

const runTest = (tests, clients) => {
  let testResult;
  process.env.FORCE_COLOR = '1';
  
  for(const test of tests)  {
    process.env.TEST = JSON.stringify(test);
    const maxRetries =
      test.retry === undefined || test.retry < 1 ? 1 : test.retry;
    let retryCount = 0;
  
    while (retryCount < maxRetries) {
      if (retryCount !== 0) {
        logger.log(`Retry attempt : ${retryCount}`);
      }

      for(const client of clients)  {
        process.env.CLIENT = JSON.stringify(client);
        logger.log(`Running ${test.name} on \nbrowser name = ${client.browserName}, \nversion = ${client.browserVersion}, and \nplatform = ${client.platform}`);
        testResult = runSync('mocha', [test.testImpl], { cwd: pathToIntegrationFolder, timeout: 100000, color: true });
        if (testResult === 1) {
          logger.log(`${test.name} failed on ${client.browserName}, ${client.browserVersion} on ${client.platform}`);
          break;
        }
      }
      if (testResult === 0) {
        logger.log(`${test.name} ran successfully on all the clients`);
        break;
      }
      retryCount++;
    }
    if (testResult === 1) {
      logger.log(`${test.name} failed`, LogLevel.ERROR);
      break;
    }
    // if (test.canaryLogPath !== undefined) {
    //   writeCanaryCompletionTime(this.payload.canaryLogPath);
    // }
  }
  // return testResult === 0 ? 0 : 1;
}

const writeCanaryCompletionTime = (filePath) => {
  try {
    const epochTimeInSeconds = Math.round(Date.now() / 1000);
    fs.appendFileSync(`${filePath}/last_run_timestamp`, `${epochTimeInSeconds}\n`, {
      flag: 'a+',
    });
    logger.log(`Wrote canary completion timestamp : ${epochTimeInSeconds}`);
  } catch (e) {
    logger.log(`Failed to write last completed canary timestamp to a file : ${e}`, LogLevel.ERROR);
  }
}

const terminateTestDemo = () => {
  const demoPid = runSync('lsof', ['-i', ':9000', '-t'], null, printOutput = false);
  if (demoPid) kill(demoPid, 'SIGKILL');

  const serverPid = runSync('lsof', ['-i', ':8080', '-t'], null, printOutput = false);
  if (serverPid) kill(serverPid, 'SIGKILL');
  logger.log('Terminated the test demo');
};

const checkTestResult = (result) => {
  if (!result || result.includes('failing')) {
    logger.log('Did not pass all tests, failed', LogLevel.ERROR);
    exit(1);
  } else {
    logger.log('Passed all tests, succeeded');
    exit(0);
  }
};

(async () => {
  const { testSuite, testType } = parseArgs();
  setupLogger();
  settestTargets(testSuite, testType);
  // startTestDemo();
  // await waitUntilTestDemoStarts();
  const testResult = startTesting(testSuite, testType);
  // terminateTestDemo();
  // checkTestResult(testResult);
})();
