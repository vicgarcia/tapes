import { useState, useEffect, CSSProperties } from 'react'
import { Container, Row, Col, Button } from "react-bootstrap";
import dayjs from 'dayjs';
import { Camera, Recording } from '@app/types';
import { getRecordingsByDate } from '@app/services/cameras';
import { CameraSelect } from './CameraSelect';
import { DateSelect } from './DateSelect';
import { Thumbnail } from './Thumbnail';
import { RecordingPlayer } from './RecordingPlayer';
import { LivePlayer } from './LivePlayer';

type ActiveView = Recording | Camera | null;

const styles = {
    controls: {
        gap: '1rem'
    } as CSSProperties,

    buttonDesktop: {
        minWidth: '120px',
        padding: '8px 16px',
        textTransform: 'uppercase'
    } as CSSProperties,

    buttonMobileFull: {
        padding: '12px',
        textTransform: 'uppercase'
    } as CSSProperties,

    buttonMobileCompact: {
        minWidth: '100px',
        padding: '12px',
        textTransform: 'uppercase'
    } as CSSProperties,

    selectWrapper: {
        minWidth: '200px'
    } as CSSProperties,

    selectWrapperFlex: {
        flex: 1
    } as CSSProperties
};

export function Dashboard() {
    const [selectedDate, setSelectedDate] = useState<Date|null>(null);
    const [selectedCamera, setSelectedCamera] = useState<Camera|null>(null);
    const [recordings, setRecordings] = useState<Array<Recording>>([]);
    const [active, setActive] = useState<ActiveView>(null);
    const [scrollToTimestamp, setScrollToTimestamp] = useState<string|null>(null);

    useEffect(() => {
        if (selectedCamera !== null && selectedDate !== null) {
            getRecordingsByDate(selectedCamera.name, dayjs(selectedDate).format('YYYY-MM-DD'))
                .then(response => setRecordings(response));
        }
    }, [selectedCamera, selectedDate])

    // Scroll to timestamp when returning to list view
    useEffect(() => {
        if (active === null && scrollToTimestamp !== null) {
            let attempts = 0;
            const maxAttempts = 30; // 3 seconds max (30 * 100ms)

            const tryScroll = () => {
                const element = document.getElementById(`recording-${scrollToTimestamp}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(tryScroll, 100);
                }
            };

            tryScroll();
        }
    }, [active, scrollToTimestamp])

    const handleRecordingClick = (recording: Recording) => {
        setScrollToTimestamp(recording.timestamp);
        setActive(recording);
    }

    const handleBackClick = () => {
        setActive(null);
    }

    const handleLiveClick = () => {
        if (selectedCamera) {
            setActive(selectedCamera);
        }
    }

    // check if active is a Camera (for live view)
    const isLiveView = active !== null && 'name' in active && !('timestamp' in active);

    // check if active is a Recording (for recording view)
    const isRecordingView = active !== null && 'timestamp' in active;

    return <Container>
      {/* header */}
      <Row className='pt-4 pb-3'>

        {/* desktop layout */}
        <Col className='d-none d-md-flex align-items-center justify-content-between'>
          {/* empty space on left */}
          <div></div>

          {/* controls - right side */}
          <div className='d-flex align-items-center' style={styles.controls}>
            {active !== null ? (
              <Button
                variant='outline-secondary'
                onClick={handleBackClick}
                style={styles.buttonDesktop}
              >
                Back
              </Button>
            ) : (
              <>
                <Button
                  variant='outline-secondary'
                  onClick={handleLiveClick}
                  disabled={selectedCamera === null}
                  style={styles.buttonDesktop}
                >
                  Live
                </Button>
                <div style={styles.selectWrapper}>
                  <DateSelect
                    selected={selectedDate}
                    setSelected={setSelectedDate}
                  />
                </div>
                <div style={styles.selectWrapper}>
                  <CameraSelect
                    selected={selectedCamera}
                    setSelected={setSelectedCamera}
                  />
                </div>
              </>
            )}
          </div>
        </Col>

        {/* mobile layout */}
        <Col className='d-md-none'>
          {active !== null ? (
            <div className='text-center'>
              <Button
                variant='outline-secondary'
                onClick={handleBackClick}
                className='w-100'
                style={styles.buttonMobileFull}
              >
                Back
              </Button>
            </div>
          ) : (
            <div className='d-flex flex-column gap-3'>
              <div className='d-flex gap-2'>
                <Button
                  variant='outline-secondary'
                  onClick={handleLiveClick}
                  disabled={selectedCamera === null}
                  style={styles.buttonMobileCompact}
                >
                  Live
                </Button>
                <div style={styles.selectWrapperFlex}>
                  <DateSelect
                    selected={selectedDate}
                    setSelected={setSelectedDate}
                  />
                </div>
              </div>
              <CameraSelect
                selected={selectedCamera}
                setSelected={setSelectedCamera}
              />
            </div>
          )}
        </Col>

      </Row>

      {/* content */}
      <Row className='pt-4'>
        <Col xs={12}>
          {isLiveView ? (
            <div className='d-flex justify-content-center'>
              <LivePlayer camera={active as Camera} />
            </div>
          ) : isRecordingView ? (
            <div className='d-flex justify-content-center'>
              <RecordingPlayer
                camera={selectedCamera!}
                recording={active as Recording}
              />
            </div>
          ) : (
            <Row className='g-3'>
              {recordings && recordings.map(r =>
                <Thumbnail
                  key={`${selectedCamera!.name}-${r.timestamp}`}
                  camera={selectedCamera!}
                  recording={r}
                  setActive={handleRecordingClick}
                />
              )}
            </Row>
          )}
        </Col>
      </Row>
    </Container>
}
