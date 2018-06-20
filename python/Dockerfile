# Python environment containing Pit.AI's devise python library
FROM ubuntu:18.04

# Setup python3 and required dependencies
ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update && apt-get install -y ca-certificates python3 python3-pip python3-pkgconfig libffi-dev dh-autoreconf libsecp256k1-dev libusb-1.0-0-dev libudev-dev
RUN pip3 install pip==10.0.1

# Install devise python library
RUN pip3 install --process-dependency-links devise

# Default command of this docker, customize as needed
ENTRYPOINT /bin/bash
