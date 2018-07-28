#!/bin/bash

DIR=`pwd`
mkdir ~/test-esyr
cd ~/test-esyr
npm install -g $DIR
echo '{
  "esyr": {
    "extends": "https://raw.githubusercontent.com/cjdelisle/esyr/1.0.0/package-json-prototypes/default-reason.json"
  },
  "name": "test-esyr",
  "version": "1.0.0",
  "description": "",
  "main": "Main.re",
  "author": "",
  "license": "ISC"
}' > ./package.json
echo 'print_endline("Hello ReasonML!");' > ./Main.re
esyr install
esyr build
./Main.exe | grep 'Hello ReasonML!' || exit 100;