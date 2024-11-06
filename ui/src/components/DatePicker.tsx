import React, { useState } from "react";
import { Container, Row, Col, Form } from "react-bootstrap";
import dayjs from 'dayjs';

type YearAndMonth = {
    year: number
    month: number       // 0-indexed
}

const monthNames: Array<string> = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

const dayNames: Array<string> = [
    'S',
    'M',
    'T',
    'W',
    'T',
    'F',
    'S',
];

function getCurrentYearAndMonth(): YearAndMonth {
    const current = dayjs();
    return {
        year: current.year(),
        month: current.month()
    }
}

function getPreviousYearAndMonth(arg: YearAndMonth): YearAndMonth {
    if (arg.month !== 0) {
        return { year: arg.year, month: arg.month - 1 };
    } else {
        return { year: arg.year - 1, month: 11 };
    }
}

function getNextYearAndMonth(arg: YearAndMonth): YearAndMonth {
    if (arg.month !== 11) {
        return { year: arg.year, month: arg.month + 1 };
    } else {
        return { year: arg.year + 1, month: 0 };
    }
}

function getMonthStartAndLength(arg: YearAndMonth) {
    const daysInMonth = new Date(arg.year, arg.month + 1, 0).getDate();
    const startDayOfWeek = new Date(arg.year, arg.month, 1).getDay();
    return [startDayOfWeek, daysInMonth];
}

export type DatePickerProps = {
    selected: Date|null
    setSelected: Function
}

export function DatePicker({selected, setSelected}: DatePickerProps) {
    const [currentYearAndMonth, setCurrentYearAndMonth] = useState<YearAndMonth>(getCurrentYearAndMonth());

    const clickPrevious = (_e: React.MouseEvent<HTMLButtonElement>) => {
        const previous = getPreviousYearAndMonth(currentYearAndMonth);
        setCurrentYearAndMonth(previous);
    };

    const clickNext = (_e: React.MouseEvent<HTMLButtonElement>) => {
        const next = getNextYearAndMonth(currentYearAndMonth);
        setCurrentYearAndMonth(next);
    };

    const calendarDate = (current: YearAndMonth, day: number) => {
        return new Date(current.year, current.month, day);
    }

    let [start, length] = getMonthStartAndLength(currentYearAndMonth!);
    let rows = [];
    let columns = [];
    for (let i = 1; i <= length ; i++) {
        if (i === 1) {
            for (let x = 0; x < start ; x++) {
                columns.push(<Col></Col>);
            }
        }
        if (
            selected !== null &&
            selected.getFullYear() === currentYearAndMonth.year &&
            selected.getMonth() === currentYearAndMonth.month &&
            selected.getDate() === i
        ) {
            columns.push(
                <Col className='fw-strong bg-secondary text-white'>{i}</Col>
            );
        } else {
            columns.push(
                <Col className='fw-strong' onClick={_ => setSelected(calendarDate(currentYearAndMonth, i))}>{i}</Col>
            );
        }
        if (i === length) {
            for (let x = columns.length; x < 7; x++) {
                columns.push(
                    <Col></Col>
                );
            }
        }
        if (columns.length === 7) {
            rows.push(<Row className='mb-2'>{columns}</Row>);
            columns = [];
        }
    }

    return (
        <Container className='text-center'>
            <Row className='mb-2 fw-strong fs-5'>
                <Col xs={2} className='text-end'>
                    <i onClick={clickPrevious} className="bi bi-caret-left h4"></i>
                </Col>
                <Col xs={8} className='text-center'>
                    {monthNames[currentYearAndMonth!.month]} {currentYearAndMonth!.year}
                </Col>
                <Col xs={2} className='text-start'>
                    <i onClick={clickNext} className="bi bi-caret-right h4"></i>
                </Col>
            </Row>
            <Row className='mb-2 fs-5'>
                {dayNames.map((d, i) => <Col key={i}>{d}</Col>)}
            </Row>
            {rows}

            <Form.Control type='date' />

        </Container>
    );
}
