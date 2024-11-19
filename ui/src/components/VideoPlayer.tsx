import ReactPlayer from 'react-player'
import { Camera } from '@app/types';
import { useAuth } from '@app/services/auth';

export type VideoPlayerProps = {
    camera: Camera
    timestamp: string
    setActive: Function
}

export function VideoPlayer({camera, timestamp, setActive}: VideoPlayerProps) {
    const auth = useAuth();
    return <div className='video-player mb-2'>
        <ReactPlayer
            url={`/cameras/${camera.name}/${timestamp}/video?token=${auth.token}`}
            controls={true}
            width='100%'
            height='100%'
        />
    </div>
}
