#!/bin/bash

pushd ui
npm run build
popd

pushd api
go build
popd

mv api/tapes .
