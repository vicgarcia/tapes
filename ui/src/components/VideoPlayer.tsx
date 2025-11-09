import ReactPlayer from 'react-player'
import { Camera, Video } from '@app/types';

export type VideoPlayerProps = {
    camera: Camera
    video: Video
}

export function VideoPlayer({camera, video}: VideoPlayerProps) {
    const videoUrl = `/cameras/${camera.name}/recordings/${video.timestamp}/video`;

    return <div className='video-player mb-5'>
        <ReactPlayer
            key={`${camera.name}-${video.timestamp}`}
            width='100%'
            height='100%'
            url={videoUrl}
            controls={true}
            onError={(error) => console.error('Video playback error:', error)}
            onReady={() => console.log('Video ready:', videoUrl)}
            config={{
                file: {
                    attributes: {
                        crossOrigin: 'same-origin'
                    }
                }
            }}
        />
    </div>
}
