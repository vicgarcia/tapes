import ReactPlayer from 'react-player'
import { Camera, Video } from '@app/types';

export type VideoPlayerProps = {
    camera: Camera
    video: Video
}

export function VideoPlayer({camera, video}: VideoPlayerProps) {
    return <div className='video-player mb-2'>
        <ReactPlayer width='100%' height='100%'
            url={`/cameras/${camera.name}/${video.timestamp}/video`}
            controls={true}
        />
    </div>
}
