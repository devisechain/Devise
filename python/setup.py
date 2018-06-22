# -*- coding: utf-8 -*-
import io
import os
import subprocess
import sys

from setuptools import setup, find_packages
from setuptools.command.install import install as _install

sys.path.append('.')

try:
    doc_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), '..', 'README.rst')
    with io.open(doc_path, 'rt', encoding='utf8') as f:
        readme = f.read()
except:
    print("Warning, no readme!")
    readme = ''


class install_all(_install):
    def run(self):
        subprocess.check_call(
            [sys.executable, '-m', 'pip', 'install', 'deps/blue_loader_python.tgz'])
        _install.run(self)


setup(name='devise',
      maintainer='Devise Foundation',
      version='1.0',
      license='GPL-3',
      description='Devise: An Ethereum Marketplace for Engineering Better Representations of Financial Markets',
      url='https://github.com/devisechain/devise',
      long_description=readme,
      packages=find_packages(exclude=['tests']),
      include_package_data=True,
      install_requires=[
          'web3==4.2.1',
          'secp256k1==0.13.2',
          'rlp==0.6.0',
          'pysha3==1.0.2'
      ],
      extras_require={
          'dev': [
              'pytest',
              'pep8',
              'pylint',
              'pytest-cov'
          ]
      },
      cmdclass={'install': install_all},
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
