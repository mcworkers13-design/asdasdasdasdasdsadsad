"use client";
import { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import SpiderGraph from './SpiderGraph';

type WalletData = {
  address: string;
  funders: { address: string, blockNum: number, hash: string }[];
  targets: { address: string, blockNum: number, hash: string }[];
  balanceEth: number;
  isDisqualified: boolean;
  status: 'pending' | 'scanning' | 'done' | 'error';
};

export default function SybilPage() {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [ethPrice, setEthPrice] = useState<number>(3000); // Default to 3000
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showSpiderGraph, setShowSpiderGraph] = useState(false);
  const [showCexInGraph, setShowCexInGraph] = useState(false);
  const [clusterNames, setClusterNames] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result;
      if (!data) return;

      let extracted: string[] = [];

      if (file.name.endsWith('.csv')) {
        const text = data as string;
        extracted = text.match(/0x[a-fA-F0-9]{40}/g) || [];
      } else if (file.name.endsWith('.xlsx')) {
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const csvData = XLSX.utils.sheet_to_csv(firstSheet);
        extracted = csvData.match(/0x[a-fA-F0-9]{40}/g) || [];
      }

      // Deduplicate
      const unique = Array.from(new Set(extracted.map(w => w.toLowerCase())));
      
      setWallets(unique.map(w => ({
        address: w,
        funders: [],
        targets: [],
        balanceEth: 0,
        isDisqualified: false,
        status: 'pending'
      })));

      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleStartScanClick = () => {
    if (wallets.length === 0 || isScanning) return;
    setShowPriceModal(true);
  };

  const startScan = async () => {
    setShowPriceModal(false);
    if (wallets.length === 0 || isScanning) return;
    setIsScanning(true);
    setProgress({ current: 0, total: wallets.length });

    // We scan iteratively to respect rate limits
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      if (w.status === 'done') continue; // Skip already scanned

      setWallets(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'scanning' } : item));

      try {
        const res = await fetch(`/api/sybil?wallet=${w.address}`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        setWallets(prev => prev.map((item, idx) => idx === i ? {
          ...item,
          funders: data.funders || [],
          targets: data.targets || [],
          balanceEth: data.balanceEth || 0,
          status: 'done'
        } : item));

      } catch (err) {
        console.error("Scan failed for", w.address, err);
        setWallets(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'error' } : item));
      }

      setProgress({ current: i + 1, total: wallets.length });
      
      // Delay 1 second to prevent rate limiting
      await delay(1000);
    }

    setIsScanning(false);
  };

  const toggleDisqualify = (address: string) => {
    setWallets(prev => prev.map(w => w.address === address ? { ...w, isDisqualified: !w.isDisqualified } : w));
  };

  const exportCleanList = () => {
    const cleanWallets = wallets.filter(w => !w.isDisqualified);
    const header = "Wallet Address\n";
    const rows = cleanWallets.map(w => w.address);
    const csvContent = "data:text/csv;charset=utf-8," + header + rows.join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "clean_wallets.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clustering Logic
  const clusters = useMemo(() => {
    const funderMap = new Map<string, { w: WalletData, blockNum: number }[]>();
    const targetMap = new Map<string, { w: WalletData, blockNum: number }[]>();

    wallets.forEach(w => {
      w.funders.forEach(f => {
        if (!funderMap.has(f.address)) funderMap.set(f.address, []);
        funderMap.get(f.address)!.push({ w, blockNum: f.blockNum });
      });
      w.targets.forEach(t => {
        if (!targetMap.has(t.address)) targetMap.set(t.address, []);
        targetMap.get(t.address)!.push({ w, blockNum: t.blockNum });
      });
    });

    const results: { type: string; address: string; wallets: WalletData[]; sameBlockCount: number }[] = [];

    // Keep ALL clusters with > 1 wallet
    funderMap.forEach((items, address) => {
      if (items.length > 1) {
        let maxSameBlock = 0;
        const blockCounts = new Map<number, number>();
        items.forEach(i => blockCounts.set(i.blockNum, (blockCounts.get(i.blockNum) || 0) + 1));
        blockCounts.forEach(count => { if (count > maxSameBlock) maxSameBlock = count; });

        results.push({ 
          type: 'Funded by the same wallet', 
          address, 
          wallets: items.map(i => i.w),
          sameBlockCount: maxSameBlock
        });
      }
    });
    
    targetMap.forEach((items, address) => {
      if (items.length > 1) {
        let maxSameBlock = 0;
        const blockCounts = new Map<number, number>();
        items.forEach(i => blockCounts.set(i.blockNum, (blockCounts.get(i.blockNum) || 0) + 1));
        blockCounts.forEach(count => { if (count > maxSameBlock) maxSameBlock = count; });

        results.push({ 
          type: 'Sent funds to same wallet', 
          address, 
          wallets: items.map(i => i.w),
          sameBlockCount: maxSameBlock
        });
      }
    });

    // Sort by largest clusters first
    return results.sort((a, b) => b.wallets.length - a.wallets.length);
  }, [wallets]);

  // Fetch Etherscan Name Tags for Clusters
  useEffect(() => {
    clusters.forEach(cluster => {
      if (!clusterNames[cluster.address]) {
        setClusterNames(prev => ({ ...prev, [cluster.address]: 'Loading tag...' }));
        
        fetch(`/api/etherscan?address=${cluster.address}`)
          .then(res => res.json())
          .then(data => {
            setClusterNames(prev => ({ ...prev, [cluster.address]: data.name }));
          })
          .catch(() => {
            setClusterNames(prev => ({ ...prev, [cluster.address]: cluster.address }));
          });
      }
    });
  }, [clusters]);

  // Prepare data for Spider Graph (filter out massive clusters if toggle is off)
  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];
    const addedNodes = new Set<string>();

    clusters.forEach(cluster => {
      const isCex = clusterNames[cluster.address] && clusterNames[cluster.address] !== cluster.address && clusterNames[cluster.address] !== 'Loading tag...';
      if (isCex && !showCexInGraph) return; // Skip CEXes in graph if toggle is off

      // Add central cluster node
      if (!addedNodes.has(cluster.address)) {
        const displayName = clusterNames[cluster.address] && clusterNames[cluster.address] !== cluster.address && clusterNames[cluster.address] !== 'Loading tag...' 
          ? clusterNames[cluster.address] 
          : (cluster.type.includes('Funded') ? 'Funder' : 'Target');
          
        nodes.push({
          id: cluster.address,
          name: displayName,
          color: '#ef4444', // red-500
          isWallet: false
        });
        addedNodes.add(cluster.address);
      }

      // Add wallet nodes and links
      cluster.wallets.forEach(w => {
        if (!addedNodes.has(w.address)) {
          nodes.push({
            id: w.address,
            name: 'Wallet',
            color: '#d1d5db', // gray-300
            isWallet: true,
            isDisqualified: w.isDisqualified
          });
          addedNodes.add(w.address);
        } else {
          // Update disqualification status just in case
          const existing = nodes.find(n => n.id === w.address);
          if (existing && existing.isWallet) {
            existing.isDisqualified = w.isDisqualified;
          }
        }

        // Link wallet to cluster center
        links.push({
          source: w.address,
          target: cluster.address
        });
      });
    });

    return { nodes, links };
  }, [clusters, clusterNames, showCexInGraph]);

  const scannedCount = wallets.filter(w => w.status === 'done' || w.status === 'error').length;
  const dqCount = wallets.filter(w => w.isDisqualified).length;

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto relative">
      
      {/* Price Input Modal */}
      {showPriceModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl relative">
            <button onClick={() => setShowPriceModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
            <h2 className="text-2xl font-bold mb-2">ETH Price Check</h2>
            <p className="text-gray-400 mb-6 text-sm">Enter the current price of ETH to display wallet balances in USD.</p>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Current ETH Price ($)</label>
                <input 
                  type="number" 
                  min="0"
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={ethPrice}
                  onChange={(e) => setEthPrice(Number(e.target.value))}
                />
              </div>
              <button 
                onClick={startScan}
                className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Confirm & Start Scan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spider Graph Modal */}
      {showSpiderGraph && (
        <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50 backdrop-blur-md">
          <div className="w-full h-16 flex justify-between items-center px-8 border-b border-gray-800 bg-gray-950">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">🕸️ Sybil Spider Graph</h2>
              <p className="text-xs text-gray-400">Massive clusters ({'>'}20 wallets) are hidden. Click any wallet node to disqualify it.</p>
            </div>
            <button onClick={() => setShowSpiderGraph(false)} className="text-gray-400 hover:text-white font-bold px-4 py-2 bg-gray-900 rounded-lg border border-gray-800">Close Graph</button>
          </div>
          <div className="flex-1 w-full p-4">
            <SpiderGraph 
              graphData={graphData} 
              onNodeClick={(node) => {
                if (node.isWallet) {
                  toggleDisqualify(node.id);
                }
              }} 
            />
          </div>
        </div>
      )}

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-red-500">Sybil Detector</h1>
          <p className="text-gray-400 text-lg mt-2 mb-8">
            Upload your master winner list. We will scan the blockchain for shared funding sources and consolidation wallets to catch farmers.
          </p>
        </div>

        <div className="flex gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
            <div className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-1">Loaded Wallets</div>
            <div className="text-3xl font-black text-white">{wallets.length}</div>
          </div>
          <div className="bg-red-900/30 border border-red-500/30 rounded-2xl p-4 text-center">
            <div className="text-sm font-medium text-red-400 uppercase tracking-wider mb-1">Disqualified</div>
            <div className="text-3xl font-black text-red-500">{dqCount}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT PANEL: Controls */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
            
            <input 
              type="file" 
              accept=".csv,.xlsx" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors border border-gray-700"
            >
              Upload Winner CSV
            </button>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Spider Graph Settings
              </label>
              <label className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-900 transition-colors">
                <span className="text-sm text-gray-400">Include CEX in Graph</span>
                <input 
                  type="checkbox" 
                  className="w-5 h-5 accent-blue-500 rounded bg-gray-800 border-gray-700"
                  checked={showCexInGraph}
                  onChange={(e) => setShowCexInGraph(e.target.checked)}
                />
              </label>
            </div>

            <button 
              onClick={handleStartScanClick}
              disabled={wallets.length === 0 || isScanning || scannedCount === wallets.length}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-lg shadow-red-900/20"
            >
              {isScanning ? 'Scanning Blockchain...' : 'Start Sybil Scan'}
            </button>

            <button 
              onClick={exportCleanList}
              disabled={wallets.length === 0}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors mt-4"
            >
              Export Clean List (No DQs)
            </button>
            
            <button 
              onClick={() => setShowSpiderGraph(true)}
              disabled={clusters.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-lg shadow-blue-900/20"
            >
              🕸️ View Spider Graph
            </button>

            {/* Progress Bar */}
            {(isScanning || scannedCount > 0) && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{scannedCount} / {wallets.length} Scanned</span>
                  <span>{Math.round((scannedCount / wallets.length) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div 
                    className="bg-red-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(scannedCount / wallets.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Clusters */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col h-[700px]">
          <h2 className="text-xl font-bold mb-6">Suspicious Clusters ({clusters.length})</h2>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-6">
            {clusters.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-gray-500 border-2 border-dashed border-gray-800 rounded-xl p-8">
                {scannedCount === 0 ? "Upload wallets and scan to detect sybil clusters." : "No suspicious clusters found!"}
              </div>
            ) : (
              <>
                {/* On-Chain Clusters (High Priority) */}
                {clusters.filter(c => !(clusterNames[c.address] && clusterNames[c.address] !== c.address && clusterNames[c.address] !== 'Loading tag...')).length > 0 && (
                  <div className="text-sm font-bold text-red-500 uppercase tracking-widest border-b border-red-900/50 pb-2">
                    High Priority: On-Chain Sybil Rings
                  </div>
                )}
                {clusters
                  .filter(c => !(clusterNames[c.address] && clusterNames[c.address] !== c.address && clusterNames[c.address] !== 'Loading tag...'))
                  .map((cluster, idx) => (
                    <div key={`onchain-${idx}`} className="shrink-0 bg-gray-950 border border-red-900/50 rounded-xl overflow-hidden shadow-lg shadow-red-900/10">
                      <div className="bg-red-950/40 p-4 border-b border-red-900/30">
                        <div className="flex justify-between items-start">
                          <div className="text-red-400 font-bold uppercase text-xs tracking-wider">{cluster.type}</div>
                        </div>
                        <div className="font-mono text-gray-300 text-sm mt-1">{cluster.address}</div>
                        <div className="flex justify-between items-center mt-2">
                          <div className="text-sm text-gray-400">
                            <span className="font-bold text-white">{cluster.wallets.length}</span> wallets involved
                          </div>
                          {cluster.sameBlockCount >= 3 && (
                            <div className="bg-red-600 text-white font-bold text-xs px-3 py-1 rounded animate-pulse shadow-lg shadow-red-900/50">
                              🚨 BULK SCRIPT: {cluster.sameBlockCount} wallets funded exactly same time
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="p-4 flex flex-col gap-2">
                        {cluster.wallets.map((w, i) => (
                          <div 
                            key={i} 
                            onClick={() => toggleDisqualify(w.address)}
                            className={`font-mono text-sm p-2 rounded cursor-pointer border transition-colors flex justify-between items-center group
                              ${w.isDisqualified 
                                ? 'bg-red-900/20 border-red-800/50 text-red-500 line-through' 
                                : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
                              }
                            `}
                          >
                            <div className="flex flex-col">
                              <span>{w.address}</span>
                              <span className={`text-xs ${w.balanceEth === 0 ? 'text-red-400 font-bold' : 'text-gray-500'}`}>
                                Balance: ${(w.balanceEth * ethPrice).toFixed(2)} {w.balanceEth === 0 && '(Empty)'}
                              </span>
                            </div>
                            <span className={`text-xs uppercase font-bold px-2 py-1 rounded ${w.isDisqualified ? 'bg-red-900/50 text-red-400' : 'opacity-0 group-hover:opacity-100 bg-gray-800 text-gray-400'}`}>
                              {w.isDisqualified ? 'Disqualified' : 'Click to DQ'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                {/* Labeled / CEX Clusters (Low Priority) */}
                {clusters.filter(c => clusterNames[c.address] && clusterNames[c.address] !== c.address && clusterNames[c.address] !== 'Loading tag...').length > 0 && (
                  <div className="text-sm font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2 mt-8">
                    Low Priority: CEX & Labeled Contracts
                  </div>
                )}
                {clusters
                  .filter(c => clusterNames[c.address] && clusterNames[c.address] !== c.address && clusterNames[c.address] !== 'Loading tag...')
                  .map((cluster, idx) => (
                    <div key={`cex-${idx}`} className="shrink-0 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
                      <div className="bg-gray-900/50 p-4 border-b border-gray-800">
                        <div className="flex justify-between items-start">
                          <div className="text-gray-500 font-bold uppercase text-xs tracking-wider">{cluster.type}</div>
                          <div className="bg-yellow-500 text-black font-bold text-xs px-2 py-1 rounded">
                            {clusterNames[cluster.address]}
                          </div>
                        </div>
                        <div className="font-mono text-gray-400 text-sm mt-1">{cluster.address}</div>
                        <div className="flex justify-between items-center mt-2">
                          <div className="text-sm text-gray-500">
                            <span className="font-bold text-gray-300">{cluster.wallets.length}</span> wallets involved
                          </div>
                          {cluster.sameBlockCount >= 3 && (
                            <div className="bg-red-600 text-white font-bold text-xs px-3 py-1 rounded animate-pulse shadow-lg shadow-red-900/50">
                              🚨 BULK SCRIPT: {cluster.sameBlockCount} wallets funded exactly same time
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="p-4 flex flex-col gap-2">
                        {cluster.wallets.map((w, i) => (
                          <div 
                            key={i} 
                            onClick={() => toggleDisqualify(w.address)}
                            className={`font-mono text-sm p-2 rounded cursor-pointer border transition-colors flex justify-between items-center group
                              ${w.isDisqualified 
                                ? 'bg-red-900/20 border-red-800/50 text-red-500 line-through' 
                                : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600'
                              }
                            `}
                          >
                            <div className="flex flex-col">
                              <span>{w.address}</span>
                              <span className={`text-xs ${w.balanceEth === 0 ? 'text-red-400 font-bold' : 'text-gray-600'}`}>
                                Balance: ${(w.balanceEth * ethPrice).toFixed(2)} {w.balanceEth === 0 && '(Empty)'}
                              </span>
                            </div>
                            <span className={`text-xs uppercase font-bold px-2 py-1 rounded ${w.isDisqualified ? 'bg-red-900/50 text-red-400' : 'opacity-0 group-hover:opacity-100 bg-gray-800 text-gray-400'}`}>
                              {w.isDisqualified ? 'Disqualified' : 'Click to DQ'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
