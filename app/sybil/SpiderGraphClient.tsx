"use client";
import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export default function SpiderGraphClient({ 
  graphData, 
  onNodeClick 
}: { 
  graphData: { nodes: any[], links: any[] }, 
  onNodeClick: (node: any) => void 
}) {
  const fgRef = useRef<any>();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
    }
  }, []);

  return (
    <div className="w-full h-full bg-gray-950 rounded-xl overflow-hidden border border-gray-800" ref={containerRef}>
      {dimensions.width > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel="name"
          nodeColor={node => node.color}
          nodeRelSize={6}
          linkColor={() => 'rgba(255, 255, 255, 0.2)'}
          onNodeClick={onNodeClick}
          cooldownTicks={100}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = node.isWallet 
              ? `${node.id.substring(0,6)}...${node.id.substring(38)}` // abbreviate wallets
              : node.id; // full address for funders
            
            const fontSize = node.isWallet ? 12 / globalScale : 14 / globalScale;
            ctx.font = `${node.isWallet ? 'normal' : 'bold'} ${fontSize}px Sans-Serif`;
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

            ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
            ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            if (node.isDisqualified) {
              ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
              ctx.fillText(label, node.x, node.y);
              ctx.beginPath();
              ctx.moveTo(node.x - textWidth / 2, node.y);
              ctx.lineTo(node.x + textWidth / 2, node.y);
              ctx.strokeStyle = 'red';
              ctx.lineWidth = 1 / globalScale;
              ctx.stroke();
            } else {
              ctx.fillStyle = node.color;
              ctx.fillText(label, node.x, node.y);
            }

            node.__bckgDimensions = bckgDimensions;
          }}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            ctx.fillStyle = color;
            const bckgDimensions = node.__bckgDimensions;
            bckgDimensions && ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
          }}
        />
      )}
    </div>
  );
}
