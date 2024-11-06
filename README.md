`tapes` is a web application for viewing security camera recordings. It is used in conjunction with `ffmpeg` to capture a camera's video output to a sequence of mp4 files. I'm also using `mediamtx` to proxy the streams from the camera and run the processes to capture recordings and `homebridge` to consume the rtsp stream from the proxy and publish it to my iPhone's Home app.

I'm running this on a Debian 12 server.

### FFMPEG

FFMpeg is used for a bunch of things. Most visibly, it's being used to capture the rtsp to 15 minute video recordings.

install ffmpeg
```
sudo apt install ffmpeg
```



### MediaMTX

MediaMTX is used to proxy the RTSP stream from the individual cameras. This allows a single connection to the camera across the network with multiple connections to the proxy from processes running on this machine.

install mediamtx
```
sudo su
mkdir /opt/mediamtx
wget https://github.com/bluenviron/mediamtx/releases/download/v1.0.0/mediamtx_v1.0.0_linux_amd64.tar.gz
tar -xzf mediamtx_v1.0.0_linux_amd64.tar.gz
exit
```

https://github.com/bluenviron/mediamtx

add configuration for a camera in mediamtx.yml
```
  cameraname:
    source: rtsp://user:password@192.168.100.101:554/live/ch0
    runOnReady: ffmpeg -loglevel error -i rtsp://localhost:8554/cameraname -c copy -f segment -segment_format mp4 -segment_time 300 -segment_atclocktime 1 -reset_timestamps 1 -strftime 1 /opt/recordings/cameraname/%Y.%m.%d.%H.%M.%S.mp4
    runOnReadyRestart: yes
```

This configuration will setup a proxy to the RTSP source specified in the `source` config. This will be a rtsp url which can/should also include credentials when necessary.

Additionally, we're using the `runOnReady` config to run ffmpeg to capture archive footage from the camera in 5 minute intervals. Leveraging `runOnReady` allows a mechanism for managing the ffmpeg processes for each camera without having to implement a seperate solution to manage those processes such as systemd or supervisor.

### HomeBridge

HomeBridge is used to expose the cameras for real time viewing in Apple HomeKit.

install homebridge
```
cd /tmp
curl -sSfL https://repo.homebridge.io/KEY.gpg | sudo gpg --dearmor | sudo tee /usr/share/keyrings/homebridge.gpg  > /dev/null
echo "deb [signed-by=/usr/share/keyrings/homebridge.gpg] https://repo.homebridge.io stable main" | sudo tee /etc/apt/sources.list.d/homebridge.list > /dev/null
sudo apt update
sudo apt install homebridge
```

https://github.com/homebridge/homebridge/wiki

Setup after install via ui @ http://<server ip>:8581

add the "Homebridge Camera FFmpeg" plugin via search

add cameras in plugin config json
```
  {
    "name": "cameraname",
    "videoConfig": {
      "source": "-i rtsp://localhost:8554/cameraname"
    }
  },
```

### Tapes

Tapes is used to provide a web application for browsing and viewing video recordings.

install htpasswd to generate the auth database
```
```

clone the repository
```
```

setup node and golang
```

```

run build script to build the app
```
./build.sh
```

setup and build the user interface with node 22
```
cd ui
npm install
npm run build
```


install the application

```
mkdir /opt/tapes
```

setup env vars
```
cp env.template /opt/tapes/env
```











