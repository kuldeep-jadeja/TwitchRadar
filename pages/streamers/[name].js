import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import ViewerChart from '../../components/ViewerChart';

export default function StreamerHistoryPage() {
    const router = useRouter();
    const { name } = router.query;
    const [data, setData] = useState([]);

    useEffect(() => {
        if (!name) return;

        fetch(`/api/streamer-history?name=${encodeURIComponent(name)}`)
            .then((res) => res.json())
            .then((json) => setData(json));
    }, [name]);

    return (
        <main style={{ padding: '2rem' }}>
            <h2>📊 Viewership History – {name}</h2>
            {data.length > 0 ? (
                <ViewerChart data={data} />
            ) : (
                <p>Loading or no data found.</p>
            )}
        </main>
    );
}
