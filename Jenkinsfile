/*
@Library('shared')
import shared.stageCheckout
import shared.notifyFailed
import shared.notifySucceeded
*/

/**
 * Checks out the current branch of the main project and its dependencies with branch matching if possible
 */
def stageCheckout(projectName, dependencies) {
    stage("Checkout") {
        // checkout the main project
        dir(projectName) {
            checkout scm
        }
        // checkout the dependencies trying the current branch first and falling back on master
        for(project in dependencies) {
            dir(project) {
                def projectUrl = 'https://github.com/pitaitechnologies/' + project
                def branchName = env.CHANGE_BRANCH ?: env.BRANCH_NAME
                try {
                    echo "Trying branch ${branchName}"
                    checkout scm: [
                        $class: 'GitSCM',
                        branches: [[name: branchName]],
                        userRemoteConfigs: [[url: projectUrl, credentialsId:'yacine']]]
                } catch (exc) {
                    echo "No good, falling back on master"
                    checkout scm: [
                        $class: 'GitSCM',
                        branches: [[name: 'master']],
                        userRemoteConfigs: [[url: projectUrl, credentialsId:'yacine']]]
                }
            }
        }
    }
}


/**
 * Installs all the packages needed to run this build
 */
def stageSetup(projectName, dependencies) {
    stage("Setup") {
        echo "Installing python dependencies for ${projectName}:"
        sh """#!/bin/bash -l
            echo "projectName: ${projectName}"
            cd ${projectName}/python && pip3 install --process-dependency-links .[dev]
        """

        echo "Installing node dependencies for ${projectName}:"
        sh """#!/bin/bash -l
            cd ${projectName}/solidity && npm install
        """

        echo "Compiling Smart Contracts for ${projectName}:"
        sh """#!/bin/bash -l
            export PATH=$PATH:${WORKSPACE}/${projectName}/solidity/node_modules/.bin/ && \
            cd ${projectName} && make solidity_migrate
        """
    }
}

/**
 *  Validates the project against pep8 code quality rules
 */
def stagePep8(projectName, subfolder='') {
    stage("Pep8") {
        echo "Running pep8 on project ${projectName}:"
        try {
            sh """#!/bin/bash -l
                set +e
                cd ${projectName}/${subfolder} && pep8 --max-line-length=120 ${projectName} tests > ${WORKSPACE}/pep8.log
                set -e
            """
        }
        catch (exc) {
            echo "Warning, caught exception during pep8 stage"
            exc.printStackTrace()
        }
        finally {
            step([$class: 'WarningsPublisher',
                parserConfigurations: [[ parserName: 'Pep8', pattern: 'pep8.log']],
                 unstableTotalAll: '9999999', usePreviousBuildAsReference: true
            ])
        }
    }
}

/**
 * Run static code analysis on project (PyLint)
 */
def stagePyLint(projectName, subfolder='') {
    stage("PyLint") {
        echo "Running PyLint on project ${projectName}:"
        try {
            codepath = subfolder ? projectName +'/' + subfolder + '/' + projectName.toLowerCase() : projectName +'/' + projectName
            sh """#!/bin/bash -l
                set +e
                PYLINTHOME=. pylint --disable=W1202,C0111,C0103 --ignored-classes=UTC,SQLAlchemy,scoped_session,SurrogatePK,Web3 --ignored-modules=numpy,flask_sqlalchemy --extension-pkg-whitelist=numpy --max-line-length=120 --output-format=parseable --reports=no ${codepath} | tee -a pylint.log
                set -e
            """
        }
        finally {
            step([$class: 'WarningsPublisher',
                parserConfigurations: [[parserName: 'PYLint', pattern: 'pylint.log']],
                unstableTotalAll: '999999',
                failedTotalHigh: '0',
                usePreviousBuildAsReference: false
            ])
        }
    }
}


/**
 * Run static code analysis on project (PyLint)
 */
def stageSolium(projectName, subfolder='') {
    stage("Solium") {
        echo "Running Solium on project ${projectName}:"
        def soliumErrors = false
        try {
            soliumErrors = sh returnStatus: true, script:"""#!/bin/bash
                cd ${projectName}/solidity && ./node_modules/.bin/solium -d contracts/ -R gcc | tee -a ${WORKSPACE}/solium.log; exit \${PIPESTATUS[0]}
            """
        }
        finally {
            step([$class: 'WarningsPublisher',
                parserConfigurations: [[parserName: 'GNU Make + GNU C Compiler (gcc)', pattern: 'solium.log']],
                unstableTotalAll: '999999',
                failedTotalHigh: '0',
                usePreviousBuildAsReference: false
            ])
        }
        // Mark step as failed
        if (soliumErrors) {
            currentBuild.result = 'FAILURE'
        }
    }
}

/**
 * Tun code coverage on the project (TODO: try to merge this with the pytest step)
 */
def stageCodeCoverage(projectName, subfolder='') {
    stage("Test Coverage") {
        withEnv(['ENV=dev', 'TEST_COVERAGE=1', 'JENKINS_BUILD=1', 'PYTHON_EGG_CACHE=/tmp/']) {
            try {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'jenkins_aws',
                    accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                    secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                ]]) {
                    sh """#!/bin/bash -l
                        cd ${projectName}/${subfolder} && \
                        AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
                        AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
                        AWS_DEFAULT_REGION=us-west-2 \
                        coverage run -m pytest tests
                        coverage xml --include=${projectName}/* && mv coverage.xml ${WORKSPACE}/
                    """
                }
            }
            catch (exc) {}
            finally {
                try {
                    step([$class: 'CoberturaPublisher', coberturaReportFile: 'coverage.xml'])
                } catch(exc) {
                    echo "Failed collecting xml test coverage results:"
                    exc.printStackTrace()
                }
            }
        }
    }
}

/**
 * Run all the pytest unit tests
 */
def stagePyTest(projectName, subfolder='') {
    stage("Python Tests") {
        withEnv(['ENV=dev', 'JENKINS_BUILD=1', 'PYTHON_EGG_CACHE=/tmp/', 'PYTHONUNBUFFERED=1']) {
            try {
                sh """#!/bin/bash -l
                    cd ${projectName}/${subfolder} && pytest --junitxml=${WORKSPACE}/pytest.xml
                """
                currentBuild.result = 'SUCCESS'
            }
            catch (exc) {
                currentBuild.result = 'FAILURE'
                throw error
            }
            finally {
                try {
                    junit '**/pytest.xml'
                } catch(exc) {
                    echo "Failed collecting xml test results:"
                    exc.printStackTrace()
                }
            }
        }
    }
}

/**
 * Run all the truffle unit tests
 */
def stageTruffleTest(projectName) {
    stage("Truffle Tests") {
        withEnv(['ENV=dev', 'JENKINS_BUILD=1']) {
            try {
                sh """#!/bin/bash -l
                    cp ${projectName}/solidity/truffle.js ${projectName}/solidity/truffle.js.bak
                    cp ${projectName}/solidity/truffle-jenkins.js ${projectName}/solidity/truffle.js
                    cd ${projectName}
                    export PATH=$PATH:${WORKSPACE}/${projectName}/solidity/node_modules/.bin/
                    make solidity_test && \
                    cd .. && cp ${projectName}/solidity/truffle.js.bak ${projectName}/solidity/truffle.js
                """
                currentBuild.result = 'SUCCESS'
            }
            catch (exc) {
                currentBuild.result = 'FAILURE'
                throw error
            }
            finally {
                try {
                    junit '**/test-results.xml'
                } catch(exc) {
                    echo "Failed collecting xml test results:"
                    exc.printStackTrace()
                }
            }
        }
    }
}


/**
 * Run all the javascript unit tests
 */
def stageJavascriptTest(projectName) {
    stage("Javascript Tests") {
        withEnv(['ENV=dev', 'JENKINS_BUILD=1']) {
            try {
                sh """#!/bin/bash -l
                    cd ${projectName}
                    export PATH=$PATH:${WORKSPACE}/${projectName}/javascript/node_modules/.bin/
                    make javascript_test_jenkins
                """
                currentBuild.result = 'SUCCESS'
            }
            catch (exc) {
                currentBuild.result = 'FAILURE'
                throw error
            }
            finally {
                try {
                    junit '**/javascript-test-results.xml'
                } catch(exc) {
                    echo "Failed collecting xml test results:"
                    exc.printStackTrace()
                }
            }
        }
    }
}


/**
 * Run all the solidity tests in code coverage mode
 */
def stageSolidityCoverage(projectName) {
    stage("Solidity Coverage") {
        withEnv(['ENV=dev', 'JENKINS_BUILD=1']) {
            try {
                sh """#!/bin/bash -l
                    cd ${projectName} && \
                    export PATH=$PATH:${WORKSPACE}/${projectName}/solidity/node_modules/.bin/ && \
                    make solidity_coverage && mv solidity/coverage/cobertura-coverage.xml ${WORKSPACE}/
                """
                currentBuild.result = 'SUCCESS'
            }
            catch (exc) {}
            finally {
                try {
                    publishHTML (target: [
                        allowMissing: false,
                        alwaysLinkToLastBuild: false,
                        keepAll: true,
                        reportDir: projectName + '/solidity/coverage',
                        reportFiles: 'index.html',
                        reportName: "Solidity Coverage"
                    ])
                } catch(exc) {
                    echo "Failed collecting xml test coverage results:"
                    exc.printStackTrace()
                }
            }
        }
    }
}



/**
 * Sends notification that the build passed
 */
def notifySucceeded() {
    currentBuild.result = 'SUCCESS'
    slackSend channel: '#jenkins', color: 'good', message: "Build Success: ${env.JOB_NAME} - ${env.BUILD_NUMBER} (<${env.RUN_DISPLAY_URL}|Open>)"
}

/**
 * Sends notification that the build failed
 */
def notifyFailed() {
    currentBuild.result = 'FAILURE'
    slackSend channel: '#jenkins', color: '#ff0000', message: "Build Failed: ${env.JOB_NAME} - ${env.BUILD_NUMBER} (<${env.RUN_DISPLAY_URL}|Open>)"
}

/**
 * This jobs runs all the checks and unit tests on the LWBacktesting project
 **/

/* Run every day at 9AMish PST if on master */
if(env.BRANCH_NAME == "master") {
    properties([pipelineTriggers([cron('H 14 * * *')])])
}

/**
 * Main entry point. Most projects should really only call this inside a node block:
 */
def buildProject(projectName, dependencies=[], docker_image = 'ganache-ci') {
    echo "Building project ${projectName} - Branch: ${env.BRANCH_NAME}"

    cleanWs()
    try {
        stageCheckout(projectName, dependencies)

        docker.withRegistry('http://localhost:5000') {
            docker.image(docker_image).inside() {
                def branchName = env.CHANGE_BRANCH ?: env.BRANCH_NAME

                sh """#!/bin/bash -l
                    nohup /home/ubuntu/init.sh &
                """
                stageSetup(projectName, dependencies)
                stagePep8(projectName, 'python')
                stagePyLint(projectName, 'python')
                stageSolium(projectName)
                stageCodeCoverage(projectName, 'python')
                stagePyTest(projectName, 'python')
                stageTruffleTest(projectName)
                stageJavascriptTest(projectName)
                if(branchName == "master") {
                    stageSolidityCoverage(projectName)
                }
            }
        }

    } catch (exc) {
        notifyFailed()
        throw exc
    }
    if(currentBuild.result == 'FAILURE') {
        notifyFailed()
    }
    else {
        notifySucceeded()
    }
}


/**
 * Where to run this, in this case, we're saying master node, can be an ssh node or any jenkins slave node
 **/
node {
    buildProject("Devise")
}
