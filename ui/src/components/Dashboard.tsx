import { useState, useEffect } from 'react'
import { Container, Row, Col, Button } from "react-bootstrap";
import dayjs from 'dayjs';
import { Camera, Video } from '@app/types';
import { getRecordingsByDate } from '@app/services/cameras';
import { CameraSelect } from './CameraSelect';
import { DateSelect } from './DateSelect';
import { Thumbnail } from './Thumbnail';
import { VideoPlayer } from './VideoPlayer';

export function Dashboard() {
    const [selectedDate, setSelectedDate] = useState<Date|null>(null);
    const [selectedCamera, setSelectedCamera] = useState<Camera|null>(null);
    const [selectedType, setSelectedType] = useState<MediaType>('recordings');
    const [videos, setVideos] = useState<Array<Video>>([]);
    const [active, setActive] = useState<Video|null>(null);

    useEffect(() => {
        if (selectedCamera !== null && selectedDate !== null) {
            getRecordingsByDate(selectedCamera.name, dayjs(selectedDate).format('YYYY-MM-DD'))
                .then(response => setVideos(response));
        }
    }, [selectedCamera, selectedDate])


    return <Container>

      {/* Header */}
      <Row className='pt-4 pb-3'>
        
        {/* Desktop Layout */}
        <Col className='d-none d-md-flex align-items-center justify-content-between'>
          {/* Empty space on left */}
          <div></div>

          {/* Controls - Right Side */}
          <div className='d-flex align-items-center' style={{gap: '1rem'}}>
            {active == null ? <>
              <div style={{minWidth: '200px'}}>
                <DateSelect
                  selected={selectedDate}
                  setSelected={setSelectedDate}
                />
              </div>
              <div style={{minWidth: '200px'}}>
                <CameraSelect
                  selected={selectedCamera}
                  setSelected={setSelectedCamera}
                />
              </div>
            </> : <>
              <Button
                variant='outline-secondary'
                onClick={handleBackClick}
                style={{minWidth: '120px', padding: '8px 16px'}}
              >
                ← Back
              </Button>
            </>}
          </div>
        </Col>

        {/* Mobile Layout */}
        <Col className='d-md-none'>
          {active == null ? (
            <div className='d-flex flex-column gap-3'>
              <DateSelect
                selected={selectedDate}
                setSelected={setSelectedDate}
              />
              <CameraSelect
                selected={selectedCamera}
                setSelected={setSelectedCamera}
              />
            </div>
          ) : (
            <div className='text-center'>
              <Button 
                variant='outline-secondary'
                onClick={_ => setActive(null)}
                className='w-100'
                style={{padding: '12px'}}
              >
                ← Back
              </Button>
            </div>
          )}
        </Col>

      </Row>

      {/* Content */}
      <Row className='pt-4'>
        <Col xs={12}>
          {active !== null ? (
            <div className='d-flex justify-content-center'>
              <VideoPlayer
                camera={selectedCamera!}
                video={active}
              />
            </div>
          ) : (
            <Row className='g-3'>
              {videos && videos.map(v =>
                <Thumbnail
                  key={`${selectedCamera!.name}-${v.timestamp}`}
                  camera={selectedCamera!}
                  video={v}
                  setActive={handleVideoClick}
                />
              )}
            </Row>
          )}
        </Col>
      </Row>
    </Container>
}
