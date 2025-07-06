`tapes` is a web application for viewing security camera recordings. It's built to be one component It is used in conjunction with `ffmpeg` to capture a camera's video output to a sequence of mp4 files. I'm also using `mediamtx` to proxy the streams from the camera and run the processes to capture recordings and `homebridge` to consume the rtsp stream from the proxy and publish it to my iPhone's Home app.

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
wget https://github.com/bluenviron/mediamtx/releases/download/v1.11.3/mediamtx_v1.11.3_linux_amd64.tar.gz
tar -xzf mediamtx_v1.11.3_linux_amd64.tar.gz
exit
```

https://github.com/bluenviron/mediamtx

add configuration for a camera in mediamtx.yml
```
  cameraname:
    source: rtsp://user:password@192.168.100.101:554/live/ch0
    runOnReady: ffmpeg -loglevel error -i rtsp://localhost:8554/cameraname -c copy -f segment -segment_format mp4 -segment_time 600 -segment_atclocktime 1 -reset_timestamps 1 -strftime 1 /opt/recordings/cameraname/%Y%m%d%H%M%S.mp4
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

setup after install via ui @ http://<server ip>:8581

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

### GoCV

tapes will use GoCV, and

https://github.com/hybridgroup/gocv

We're going to need Open CV 4.10 installed. Build this from source.

```
sudo su
mkdir /opt/gocv
cd /opt/gocv


wget -O /opencv.zip https://github.com/opencv/opencv/archive/4.10.0.zip
unzip /opencv.zip
mkdir build
cd build
cmake -D HAVE_FFMPEG=ON -D OPENCV_GENERATE_PKGCONFIG=YES -D OPENCV_EXTRA_MODULES_PATH=../opencv_contrib-4.10.0/modules ../opencv-4.10.0
cmake --build .
make install
```

This takes a while. It takes a while natively. It takes a while in a Docker build. Go do something else while it compiles.

https://docs.opencv.org/4.x/d7/d9f/tutorial_linux_install.html


### Tapes

Tapes is used to provide a web application for browsing and viewing video recordings.

Clone the repository
```
git clone git@github.com:vicgarcia/tapes.git
```

Install htpasswd to generate the auth database
```
sudo apt install apache2-utils
```

To setup for local development, see the Dockerfile for dependencies.

The `Dockerfile` in this repository is used to build an image with the necessary tools install to build the `tapes` application. This includes Node, Golang, and OpenCV.

```
docker build -t tapes-builder .
```

Once the container is built, it can be run to build the `tapes` application. The binary executable will be available in the root of this repository once complete. Once built, the application can be installed. The container build takes a while to compile opencv.

Install tapes
```
sudo su
mkdir /opt/tapes
```

Copy tapes from wherever it's built to /opt/tapes/tapes

Setup env vars
```
vim /opt/tapes/env
---
RECORDING_PATH=/opt/recordings
PASSWORDS_PATH=/opt/tapes/passwords
JWT_KEY=<random 64 char string>
```

Create a user in the password file
```

```

Run tapes
```
cd /opt/tapes
./tapes
```

Running this as a service is left to your imagination.


