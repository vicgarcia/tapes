import ReactPlayer from 'react-player'
import { Camera } from '@app/types';
import { useAuth } from '@app/services/auth';

export type VideoPlayerProps = {
    camera: Camera
    timestamp: string
}

export function VideoPlayer({camera, timestamp}: VideoPlayerProps) {
    const auth = useAuth();
    return <div className='video-player mb-2'>
        <ReactPlayer width='100%' height='100%'
            url={`/cameras/${camera.name}/${timestamp}/video?token=${auth.token}`}
            controls={true}
        />
    </div>
}
