import ReactPlayer from 'react-player'
import { Camera, Video } from '@app/types';
import { useAuth } from '@app/services/auth';

export type VideoPlayerProps = {
    camera: Camera
    video: Video
}

export function VideoPlayer({camera, video}: VideoPlayerProps) {
    const auth = useAuth();
    return <div className='video-player mb-2'>
        <ReactPlayer width='100%' height='100%'
            url={`/cameras/${camera.name}/${video.timestamp}/video?token=${auth.token}`}
            controls={true}
        />
    </div>
}
