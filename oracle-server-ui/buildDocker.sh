#!/bin/bash

# Build from bitcoin-s-ts scope
cd ..
# Build the Image
docker build . -f oracle-server-ui/Dockerfile -t bitcoinscala/oracle-server-ui:latest -t localhost:5000/bitcoinscala/oracle-server-ui
# Push to local registry
docker push localhost:5000/bitcoinscala/oracle-server-ui
