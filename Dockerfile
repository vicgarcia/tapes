FROM debian:bookworm-slim

RUN apt-get clean && apt-get update
RUN apt-get install -y curl software-properties-common cmake g++ wget unzip git sudo
RUN apt-get update && apt-get upgrade -y

# install nodejs
RUN curl -sL https://deb.nodesource.com/setup_23.x | bash -
RUN apt-get update
RUN apt install -y nodejs

# install golang
RUN add-apt-repository 'deb http://deb.debian.org/debian bookworm-backports main'
RUN apt-get update
RUN apt-get install -y golang-1.22
RUN ln -s /usr/lib/go-1.22/bin/* /usr/local/bin/

# install gocv
WORKDIR /gocv
RUN git clone https://github.com/hybridgroup/gocv.git .
RUN make install


# WORKDIR /opencv

# RUN wget -O /opencv.zip https://github.com/opencv/opencv/archive/4.10.0.zip && \
#     unzip /opencv.zip

# WORKDIR /opencv/build

# RUN cmake -D OPENCV_GENERATE_PKGCONFIG=YES ../opencv-4.10.0 && \
#     cmake --build . && \
#     make install

# # https://docs.opencv.org/4.x/d7/d9f/tutorial_linux_install.html


# WORKDIR /src

# RUN PATH="/src:$PATH"

# CMD ["bash", "build"]
