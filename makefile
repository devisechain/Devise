VERSION = $(shell echo "import devise;print(devise.__version__)" | PYTHONPATH=./python python)

all: python_test solidity_test javascript_test

python_test: solidity_compile solidity_migrate setup_python
	@echo Running python tests
	cd python && PYTHONPATH=. pytest

solidity_coverage:
	@echo Running solidity coverage
	cd solidity && \
	./node_modules/.bin/solidity-coverage
	cd solidity && \
	./node_modules/.bin/istanbul report cobertura

solidity_test: unlock_test_owner unlock_test_accounts
	@echo Running solidity tests
	cd solidity && truffle test


javascript_test_jenkins: setup_javacript
	@echo Running javascript tests
	cd javascript && MOCHA_FILE=./javascript-test-results.xml ./node_modules/.bin/mocha tests --reporter mocha-junit-reporter

javascript_test: setup_javacript
	@echo Running javascript tests
	cd javascript && npm test

solidity_compile: unlock_test_owner
	@echo Compiling Smart Contracts
	cd solidity && \
	rm -rf build && \
	truffle compile && \
	cat build/contracts/DeviseRentalImpl.json | jq -r '.abi' > ../config/abi/devise_rental_proxy.json && \
	cat build/contracts/DeviseToken.json | jq -r '.abi' > ../config/abi/devise_token.json && \
	cat build/contracts/DeviseRentalProxy.json | jq -r '.abi' > ../python/Devise/abi/DeviseRentalProxy.json && \
	cat build/contracts/DeviseRentalImpl.json | jq -r '.abi' > ../python/Devise/abi/DeviseRentalImpl.json && \
	cat build/contracts/DeviseToken.json | jq -r '.abi' > ../python/Devise/abi/DeviseToken.json && \
	cat build/contracts/AuditImpl.json | jq -r '.abi' > ../python/Devise/abi/AuditImpl.json


solidity_migrate: unlock_test_owner unlock_test_accounts
	@echo Deploying Smart Contracts
	cd solidity && \
	truffle migrate --reset

unlock_test_owner:
	@echo Unlocking accounts[0]
	cd solidity && echo "web3.personal.unlockAccount(web3.eth.accounts[0], '')" | truffle console

unlock_test_accounts:
	@echo Unlocking accounts[0:20]
	cd solidity && echo "web3.eth.accounts.forEach((acct, idx) => web3.personal.unlockAccount(acct, ''))" | truffle console

setup_solidity:
	# Install solidity deps
	cd solidity && npm install --python=/usr/bin/python2.7
	# Install json parser if it's not already installed
	command -v jq || brew install jq

setup_python:
	# Install python deps
	cd python && \
	pip3 install setuptools -U && \
	pip3 install .[dev]

setup_javacript:
	# Install javascript deps
	cd javascript && npm install --python=/usr/bin/python2.7 && \
	NEXT_VERSION=$(VERSION) && \
	node -e "\
		var j = require('./package.json');\
		j.version = \"$$NEXT_VERSION\";\
		var s = JSON.stringify(j, null, 2);\
		require('fs').writeFileSync('./package.json', s);" && \
	npm run build_dev && \
	npm run build

setup: setup_solidity setup_python

deploy_pypi:
	cp README.rst python/
	cd python && python3 setup.py clean sdist upload
	rm python/README.rst

deploy_pypi_test:
	cp README.rst python/
	cd python && python3 setup.py clean sdist upload -r testpypi
	rm python/README.rst

docker_build:
	cd python && docker build --no-cache -t devise:latest .

docker_tag:
	cd python && docker tag devise:latest devisechain/python:$(VERSION)
	cd python && docker tag devise:latest devisechain/python:latest

docker_push:
	docker push devisechain/python:latest
	docker push devisechain/python:$(VERSION)
