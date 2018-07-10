# Python environment containing Pit.AI's devise python library
FROM ubuntu:18.04

# Setup python3 and required dependencies
ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update && apt-get install -y ca-certificates python3 python3-pip python3-pkgconfig libffi-dev dh-autoreconf libsecp256k1-dev libusb-1.0-0-dev libudev-dev
RUN pip3 install pip==10.0.1

# Install devise python library
RUN pip3 install devise jupyter pandas

# Add Tini. Tini operates as a process subreaper for jupyter. This prevents kernel crashes.
ENV TINI_VERSION v0.6.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /usr/bin/tini
RUN chmod +x /usr/bin/tini
ENTRYPOINT ["/usr/bin/tini", "--"]

# Expose Jupyter port
EXPOSE 3477

# Create a regular user to run jupyter
RUN useradd -ms /bin/bash ubuntu
USER ubuntu
WORKDIR /home/ubuntu

# Use bash as the shell inside Jupyter terminals
ENV SHELL=/bin/bash

# Finally, run Jupyter notebook
CMD mkdir -p ~/.devise/notebooks && jupyter notebook --notebook-dir=~/.devise/notebooks --ip=* --port=3477 --NotebookApp.token='' --NotebookApp.password=''
