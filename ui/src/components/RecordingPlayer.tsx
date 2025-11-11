import ReactPlayer from 'react-player'
import { Camera, Recording } from '@app/types';

export type RecordingPlayerProps = {
    camera: Camera
    recording: Recording
}

export function RecordingPlayer({camera, recording}: RecordingPlayerProps) {
    const videoUrl = `/cameras/${camera.name}/recordings/${recording.timestamp}/video`;

    return <div className='recording-player mb-5'>
        <ReactPlayer
            key={`${camera.name}-${recording.timestamp}`}
            width='100%'
            height='100%'
            url={videoUrl}
            controls={true}
            onError={(error) => console.error('Recording playback error:', error)}
            onReady={() => console.log('Recording ready:', videoUrl)}
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
