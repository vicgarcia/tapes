import ReactPlayer from 'react-player'
import { Camera, Video } from '@app/types';

export type VideoPlayerProps = {
    camera: Camera
    video: Video
    mediaType: 'recordings' | 'events'
}

export function VideoPlayer({camera, video, mediaType}: VideoPlayerProps) {
    const slug = mediaType === 'events' && video.event_type 
        ? `${video.timestamp}-${video.event_type}`
        : video.timestamp;
    const videoUrl = `/cameras/${camera.name}/${mediaType}/${slug}/video`;
    
    return <div className='video-player mb-5'>
        <ReactPlayer 
            key={`${camera.name}-${mediaType}-${slug}`}
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
