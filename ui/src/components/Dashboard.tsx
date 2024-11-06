import { useState, useEffect } from 'react'
import { Container, Row, Col } from "react-bootstrap";
import dayjs from 'dayjs';
import { Camera } from '@app/types';
import { getRecordingsByDate } from '@app/services/cameras';
import { CameraSelect } from './CameraSelect';
import { DateSelect } from './DateSelect';
import { Thumbnail } from './Thumbnail';
import { VideoPlayer } from './VideoPlayer';

export function Dashboard() {
    const [selectedDate, setSelectedDate] = useState<Date|null>(null);
    const [selectedCamera, setSelectedCamera] = useState<Camera|null>(null);
    const [videos, setVideos] = useState<Array<any>>([]);
    const [active, setActive] = useState<string|null>(null);

    useEffect(() => {
        if (selectedCamera !== null && selectedDate !== null) {
            getRecordingsByDate(selectedCamera.name, dayjs(selectedDate).format('YYYY-MM-DD'))
                .then(response => setVideos(response));
        }
    }, [selectedCamera, selectedDate])

    return <Container>
      <Row className='pt-4 g-5'>

        <Col lg={6} className='d-none d-lg-block'>
            <h3>tapes.4406fillmore.com</h3>
        </Col>

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

      </Row>

      <Row className='pt-4 g-5'>

        <Col xs={12} lg={12} className='text-end'>
            {active !== null ? <>
                <VideoPlayer
                    camera={selectedCamera!}
                    timestamp={active}
                    setActive={setActive}
                />
            </> : <>
                <Row>
                    {videos && videos.map(v =>
                        <Thumbnail
                            camera={selectedCamera!}
                            timestamp={v.timestamp}
                            setActive={setActive}
                        />
                    )}
                </Row>
            </>}
        </Col>

      </Row>
    </Container>
}
