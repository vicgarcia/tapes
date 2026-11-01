import { Link, useParams } from 'react-router-dom';

export default function CameraView() {
    const { name } = useParams();
    return <main className="page">
        <Link to="/" className="btn">Back to cameras</Link>
        <h1>{name}</h1>
        <p>The camera player is coming next.</p>
    </main>;
}
