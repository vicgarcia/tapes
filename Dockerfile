FROM debian:bookworm-slim

RUN apt-get clean && apt-get update

RUN apt-get install -y curl software-properties-common cmake g++ wget unzip


RUN curl -sL https://deb.nodesource.com/setup_23.x | bash -

RUN apt update && apt upgrade -y

RUN apt install -y nodejs


RUN add-apt-repository 'deb http://deb.debian.org/debian bookworm-backports main'

RUN apt update && apt upgrade -y

RUN apt install -y golang-1.22

RUN ln -s /usr/lib/go-1.22/bin/* /usr/local/bin/


WORKDIR /opencv

RUN wget -O /opencv.zip https://github.com/opencv/opencv/archive/4.10.0.zip && \
    unzip /opencv.zip

WORKDIR /opencv/build

RUN cmake -D OPENCV_GENERATE_PKGCONFIG=YES ../opencv-4.10.0 && \
    cmake --build . && \
    make install

# https://docs.opencv.org/4.x/d7/d9f/tutorial_linux_install.html


WORKDIR /src

RUN PATH="/src:$PATH"

CMD ["bash", "build"]
