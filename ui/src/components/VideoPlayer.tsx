import ReactPlayer from 'react-player'
import { Button } from "react-bootstrap";
import { Camera } from '@app/types';
import { useAuth } from '@app/services/auth';

export type VideoPlayerProps = {
    camera: Camera
    timestamp: string
    setActive: Function
}

export function VideoPlayer({camera, timestamp, setActive}: VideoPlayerProps) {
    const auth = useAuth();
    return <div className='video-player'>
        <ReactPlayer
            url={`/cameras/${camera.name}/${timestamp}/video?token=${auth.token}`}
            controls={true}
            width='100%'
            height='100%'
        />
        <div className='text-end mt-2'>
            <Button size='sm' className='px-5 uppercase'
                variant='outline-secondary'
                onClick={_ => setActive(null)}
            >back</Button>
        </div>
    </div>
}
