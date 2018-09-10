# -*- coding: utf-8 -*-
import io
import os
import re
import subprocess
import sys

from setuptools import setup, find_packages

sys.path.append('.')

try:
    doc_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..', 'README.rst')
    with io.open(doc_path, 'rt', encoding='utf8') as f:
        readme = f.read()
except:
    print("Warning, no readme!")
    readme = ''


def install_devise_dependencies():
    print("Installing platform specific wheels...")
    try:
        # For windows, try to install one of the pre-built binary wheels
        subprocess.call([sys.executable, '-m', 'pip', 'install', '--find-links=deps/', 'toolz==0.9.0'])
        subprocess.call([sys.executable, '-m', 'pip', 'install', '--no-index', '--find-links=deps/', 'cytoolz'])
        subprocess.call([sys.executable, '-m', 'pip', 'install', '--no-index', '--find-links=deps/', 'lru_dict'])
        subprocess.call([sys.executable, '-m', 'pip', 'install', '--no-index', '--find-links=deps/', 'pysha3'])
        subprocess.call([sys.executable, '-m', 'pip', 'install', '--no-index', '--find-links=deps/', 'hidapi'])
    except:
        pass

    # Install ledger blue
    print("Installing custom dependencies...")
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', "--find-links=deps/", "ledgerblue==0.1.18"])


def devise_setup(**kwargs):
    """Install prerequisites first then run the rest"""
    install_devise_dependencies()
    setup(**kwargs)


# Get our current package version from the devise module
with io.open('devise/__init__.py', 'rt', encoding='utf8') as f:
    version = re.search(r'__version__ = \'(.*?)\'', f.read()).group(1)

devise_setup(name='devise',
             maintainer='Devise Foundation',
             version=version,
             license='GPL-3',
             description='Devise: An Ethereum Marketplace for Engineering Better Representations of Financial Markets',
             url='https://github.com/devisechain/devise',
             long_description=readme,
             packages=find_packages(exclude=['tests']),
             include_package_data=True,
             install_requires=[
                 'web3==4.2.1',
                 'rlp==0.6.0',
                 'pysha3==1.0.2',
                 'eth-abi==1.1.1',
                 'eth-utils==1.0.3'
             ],
             extras_require={
                 'dev': [
                     'pytest',
                     'pep8',
                     'pylint',
                     'pytest-cov'
                 ]
             },
             classifiers=[
                 'Development Status :: 4 - Beta',
                 'Environment :: Console',
                 'Intended Audience :: Developers',
                 'License :: OSI Approved :: GNU General Public License v3 (GPLv3)',
                 'Operating System :: OS Independent',
                 'Programming Language :: Python',
                 'Programming Language :: Python :: 3.5',
                 'Programming Language :: Python :: 3.6',
                 'Topic :: Software Development :: Libraries',
                 'Topic :: Office/Business :: Financial :: Investment'
             ])
