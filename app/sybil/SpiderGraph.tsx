"use client";
import dynamic from 'next/dynamic';

const SpiderGraph = dynamic(() => import('./SpiderGraphClient'), { ssr: false });

export default SpiderGraph;
