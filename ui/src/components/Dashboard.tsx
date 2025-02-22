import { useState, useEffect } from 'react'
import { Container, Row, Col, Button } from "react-bootstrap";
import dayjs from 'dayjs';
import { Camera, Video } from '@app/types';
import { getVideosByDate } from '@app/services/cameras';
import { CameraSelect } from './CameraSelect';
import { DateSelect } from './DateSelect';
import { Thumbnail } from './Thumbnail';
import { VideoPlayer } from './VideoPlayer';

export function Dashboard() {
    const [selectedDate, setSelectedDate] = useState<Date|null>(null);
    const [selectedCamera, setSelectedCamera] = useState<Camera|null>(null);
    const [videos, setVideos] = useState<Array<Video>>([]);
    const [active, setActive] = useState<Video|null>(null);

    useEffect(() => {
        if (selectedCamera !== null && selectedDate !== null) {
            getVideosByDate(selectedCamera.name, dayjs(selectedDate).format('YYYY-MM-DD'))
                .then(response => setVideos(response));
        }
    }, [selectedCamera, selectedDate])

    return <Container>
      <Row className='pt-4 g-5'>

        <Col lg={6} className='d-none d-lg-block'>
            <h1><i className='bi bi-cassette header-icon'></i>tapes</h1>
        </Col>

        {active == null ? <>
            <Col xs={6} lg={3} className='text-center'>
                <CameraSelect
                    selected={selectedCamera}
                    setSelected={setSelectedCamera}
                />
            </Col>

            <Col xs={6} lg={3} className='text-center'>
                <DateSelect
                    selected={selectedDate}
                    setSelected={setSelectedDate}
                />
            </Col>
        </> : <>
            <Col xs={12} lg={6} className='text-end'>
                <Button size='sm' className='uppercase p-2' style={{width: '200px'}}
                    variant='outline-secondary'
                    onClick={_ => setActive(null)}
                >back</Button>
            </Col>
        </>}

      </Row>

      <Row className='pt-4 g-5'>

        <Col xs={12} lg={12} className='text-end'>
            {active !== null ? <>
                <VideoPlayer
                    camera={selectedCamera!}
                    video={active}
                />
            </> : <>
                <Row>
                    {videos && videos.map(v =>
                        <Thumbnail
                            key={`${selectedCamera!.name}-${v.timestamp}`}
                            camera={selectedCamera!}
                            video={v}
                            setActive={setActive}
                        />
                    )}
                </Row>
            </>}
        </Col>

      </Row>
    </Container>
}
