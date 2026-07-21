"use client";
import { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';

type Collab = {
  id: string;
  name: string;
  username: string;
  gtdSpots: number;
  fcfsSpots: number;
  isFinished: boolean;
  wallets: { address: string; type: 'GTD' | 'FCFS' }[];
};

export default function TrackerPage() {
  const [collabs, setCollabs] = useState<Collab[]>([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newGtdSpots, setNewGtdSpots] = useState<number | "">("");
  const [newFcfsSpots, setNewFcfsSpots] = useState<number | "">("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeCollabId, setActiveCollabId] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<'GTD' | 'FCFS'>('GTD');
  const [parsedWallets, setParsedWallets] = useState<string[]>([]);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const modalFileRef = useRef<HTMLInputElement>(null);

  const addCollab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || (newGtdSpots === "" && newFcfsSpots === "")) return;
    
    if (collabs.some(c => c.name.toLowerCase() === newName.trim().toLowerCase())) {
      alert("This Community Name is already being tracked!");
      return;
    }

    setCollabs([...collabs, {
      id: Math.random().toString(36).substring(7),
      name: newName.trim(),
      username: newUsername ? (newUsername.startsWith('@') ? newUsername : `@${newUsername}`) : "N/A",
      gtdSpots: Number(newGtdSpots) || 0,
      fcfsSpots: Number(newFcfsSpots) || 0,
      isFinished: false,
      wallets: []
    }]);
    
    setNewName("");
    setNewUsername("");
    setNewGtdSpots("");
    setNewFcfsSpots("");
  };

  const removeCollab = (id: string) => {
    setCollabs(collabs.filter(c => c.id !== id));
  };

  // --- MODAL & WALLET LOGIC ---
  const handleCheckboxClick = (collab: Collab) => {
    if (collab.isFinished) {
      // Uncheck it and clear wallets
      setCollabs(collabs.map(c => 
        c.id === collab.id ? { ...c, isFinished: false, wallets: [] } : c
      ));
    } else {
      // Open Modal to upload winners
      setActiveCollabId(collab.id);
      setParsedWallets([]);
      setUploadWarning(null);
      setUploadType(collab.gtdSpots > 0 ? 'GTD' : 'FCFS');
      setIsModalOpen(true);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveCollabId(null);
    setParsedWallets([]);
    setUploadWarning(null);
  };

  const handleWinnerFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result;
      if (!data) return;

      let extractedWallets: string[] = [];

      if (file.name.endsWith('.csv')) {
        const text = data as string;
        extractedWallets = text.match(/0x[a-fA-F0-9]{40}/g) || [];
      } else if (file.name.endsWith('.xlsx')) {
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const csvData = XLSX.utils.sheet_to_csv(firstSheet);
        extractedWallets = csvData.match(/0x[a-fA-F0-9]{40}/g) || [];
      }

      // Deduplicate wallets
      const uniqueWallets = Array.from(new Set(extractedWallets));
      setParsedWallets(uniqueWallets);

      // Validation warning
      const collab = collabs.find(c => c.id === activeCollabId);
      if (collab) {
        const allowedSpots = uploadType === 'GTD' ? collab.gtdSpots : collab.fcfsSpots;
        if (uniqueWallets.length > allowedSpots) {
          setUploadWarning(`Warning: You uploaded ${uniqueWallets.length} wallets, but only allocated ${allowedSpots} ${uploadType} spots.`);
        } else {
          setUploadWarning(null);
        }
      }

      if (modalFileRef.current) modalFileRef.current.value = "";
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const confirmFinishCollab = () => {
    if (!activeCollabId) return;
    
    setCollabs(collabs.map(c => {
      if (c.id === activeCollabId) {
        const mappedWallets = parsedWallets.map(w => ({ address: w, type: uploadType }));
        return { ...c, isFinished: true, wallets: mappedWallets };
      }
      return c;
    }));
    
    closeModal();
  };
  // ----------------------------

  const totalGtdSpots = useMemo(() => {
    return collabs.reduce((sum, c) => sum + c.gtdSpots, 0);
  }, [collabs]);

  const totalFcfsSpots = useMemo(() => {
    return collabs.reduce((sum, c) => sum + c.fcfsSpots, 0);
  }, [collabs]);

  // TRACKER CSV IMPORT/EXPORT
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const newCollabs: Collab[] = [];
      
      const startIdx = lines[0]?.toLowerCase().includes('name') ? 1 : 0;
      
      for (let i = startIdx; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const parts: string[] = [];
        let current = '';
        let inQuotes = false;
        const line = lines[i].trim();
        
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') {
            if (inQuotes && line[j+1] === '"') {
              current += '"';
              j++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            parts.push(current);
            current = '';
          } else {
            current += char;
          }
        }
        parts.push(current);

        if (parts.length >= 2 && parts[0].trim() !== "") {
          const name = parts[0].trim();
          let username = "N/A";
          let gtd = 0;
          let fcfs = 0;
          let isFinished = false;
          let wallets = [];

          if (parts.length >= 6) {
             username = parts[1].trim();
             gtd = parseInt(parts[2].trim().replace(/[^0-9]/g, '')) || 0;
             fcfs = parseInt(parts[3].trim().replace(/[^0-9]/g, '')) || 0;
             isFinished = parts[4].trim().toLowerCase() === 'finished';
             try { wallets = JSON.parse(parts[5]); } catch { wallets = []; }
          } else if (parts.length === 5) {
             username = parts[1].trim();
             gtd = parseInt(parts[2].trim().replace(/[^0-9]/g, '')) || 0;
             fcfs = parseInt(parts[3].trim().replace(/[^0-9]/g, '')) || 0;
             isFinished = parts[4].trim().toLowerCase() === 'finished';
          } else if (parts.length === 4) {
             username = parts[1].trim();
             gtd = parseInt(parts[2].trim().replace(/[^0-9]/g, '')) || 0;
             fcfs = parseInt(parts[3].trim().replace(/[^0-9]/g, '')) || 0;
          } else if (parts.length === 3) {
             username = parts[1].trim();
             gtd = parseInt(parts[2].trim().replace(/[^0-9]/g, '')) || 0;
          } else if (parts.length === 2) {
             gtd = parseInt(parts[1].trim().replace(/[^0-9]/g, '')) || 0;
          }
          
          if (name && (!isNaN(gtd) || !isNaN(fcfs))) {
            newCollabs.push({
              id: Math.random().toString(36).substring(7),
              name: name,
              username: username,
              gtdSpots: gtd,
              fcfsSpots: fcfs,
              isFinished: isFinished,
              wallets: wallets
            });
          }
        }
      }
      
      if (newCollabs.length > 0) {
        setCollabs(prev => {
          const uniqueMap = new Map(prev.map(c => [c.name.toLowerCase(), c]));
          newCollabs.forEach(nc => {
            if (!uniqueMap.has(nc.name.toLowerCase())) {
              uniqueMap.set(nc.name.toLowerCase(), nc);
            }
          });
          return Array.from(uniqueMap.values());
        });
      }
      
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const exportTrackerCSV = () => {
    const header = "Collab Name,X Username,GTD Spots,FCFS Spots,Status,Wallets\n";
    const csvRows = collabs.map(c => {
      const walletsJson = JSON.stringify(c.wallets).replace(/"/g, '""');
      return `"${c.name.replace(/"/g, '""')}","${c.username}",${c.gtdSpots},${c.fcfsSpots},${c.isFinished ? 'Finished' : 'Pending'},"${walletsJson}"`;
    });
    const csvContent = "data:text/csv;charset=utf-8," + header + csvRows.join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "collab_tracker.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // OVERARCHING WINNERS CSV
  const exportWinnersCSV = (type: 'GTD' | 'FCFS') => {
    const header = "Wallet Address\n";
    let rows: string[] = [];
    
    collabs.forEach(c => {
      c.wallets.forEach(w => {
        if (w.type === type) {
          rows.push(`${w.address}`);
        }
      });
    });

    if (rows.length === 0) return alert(`No ${type} winner wallets have been uploaded yet!`);

    const csvContent = "data:text/csv;charset=utf-8," + header + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `master_${type.toLowerCase()}_wallets.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sortedCollabs = [...collabs].sort((a, b) => {
    if (a.isFinished === b.isFinished) return 0;
    return a.isFinished ? 1 : -1;
  });

  const filteredCollabs = sortedCollabs.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.username && c.username.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const completedCount = collabs.filter(c => c.isFinished).length;

  return (
    <div className="flex flex-col gap-6 max-w-5xl relative">
      
      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={closeModal} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
            
            <h2 className="text-2xl font-bold mb-2">Finish Collaboration</h2>
            <p className="text-gray-400 mb-6 text-sm">Upload the winner wallets for this community to mark it as completed.</p>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Spot Type</label>
                <div className="flex bg-gray-950 rounded-xl p-1 border border-gray-800">
                  <button 
                    onClick={() => setUploadType('GTD')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${uploadType === 'GTD' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    GTD Pool
                  </button>
                  <button 
                    onClick={() => setUploadType('FCFS')}
                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${uploadType === 'FCFS' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    FCFS Pool
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Upload Winners (.csv, .xlsx)</label>
                <input 
                  type="file" 
                  accept=".csv,.xlsx" 
                  className="hidden" 
                  ref={modalFileRef}
                  onChange={handleWinnerFileUpload}
                />
                <button 
                  onClick={() => modalFileRef.current?.click()}
                  className="w-full bg-gray-800 border border-gray-700 hover:border-indigo-500 hover:bg-gray-750 text-white py-4 px-4 rounded-xl text-sm font-bold transition-colors flex flex-col items-center justify-center gap-2 border-dashed"
                >
                  <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                  Select File
                </button>
              </div>

              {parsedWallets.length > 0 && (
                <div className="bg-indigo-900/30 border border-indigo-500/30 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-indigo-400">{parsedWallets.length}</div>
                  <div className="text-xs text-indigo-200 uppercase tracking-wider font-bold">Wallets Extracted</div>
                </div>
              )}

              {uploadWarning && (
                <div className="bg-orange-900/30 border border-orange-500/50 text-orange-400 p-3 rounded-xl text-sm">
                  {uploadWarning}
                </div>
              )}

              <button 
                onClick={confirmFinishCollab}
                disabled={parsedWallets.length === 0}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Confirm & Finish
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Collab Tracker</h1>
          <p className="text-gray-400 text-lg mt-2 mb-8">
            Keep a running total of all GTD and FCFS whitelist spots you've distributed to partner communities.
          </p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-2xl px-8 py-4 flex flex-col items-center shadow-lg">
            <div className="text-sm font-medium text-indigo-300 uppercase tracking-wider mb-1">Total GTD</div>
            <div className="text-5xl font-black text-white">{totalGtdSpots.toLocaleString()}</div>
          </div>
          <div className="bg-emerald-600/20 border border-emerald-500/30 rounded-2xl px-8 py-4 flex flex-col items-center shadow-lg">
            <div className="text-sm font-medium text-emerald-300 uppercase tracking-wider mb-1">Total FCFS</div>
            <div className="text-5xl font-black text-white">{totalFcfsSpots.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Left Column: Input */}
        <div className="flex flex-col gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-6">Add Collaboration</h2>
            <form onSubmit={addCollab} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Community Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Alpha DAO" 
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">X Username (Optional)</label>
                <input 
                  type="text" 
                  placeholder="@username" 
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-indigo-400 mb-2">GTD Spots</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="0" 
                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newGtdSpots}
                    onChange={(e) => setNewGtdSpots(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-emerald-400 mb-2">FCFS Spots</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="0" 
                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={newFcfsSpots}
                    onChange={(e) => setNewFcfsSpots(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              </div>
              <button 
                type="submit"
                disabled={!newName || (newGtdSpots === "" && newFcfsSpots === "")}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Add to Tracker
              </button>
            </form>
          </div>
          
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col justify-center items-center text-center gap-4">
            <h2 className="text-xl font-bold">Master Winner List</h2>
            <p className="text-gray-400 text-sm">Download raw wallet lists containing every single winner you extracted across all Finished collabs.</p>
            <div className="flex gap-4 w-full">
              <button 
                  onClick={() => exportWinnersCSV('GTD')}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-lg shadow-indigo-900/20"
                >
                  Export GTD Wallets
              </button>
              <button 
                  onClick={() => exportWinnersCSV('FCFS')}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-lg shadow-emerald-900/20"
                >
                  Export FCFS Wallets
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Results Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col h-[700px]">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold">Tracked Collabs</h2>
              <div className="text-sm text-gray-400 mt-1">
                {completedCount} / {collabs.length} completed
              </div>
            </div>
            
            <div className="flex gap-3">
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-gray-800 hover:bg-gray-700 text-white py-2 px-4 rounded-lg text-sm font-bold transition-colors"
              >
                Import Save
              </button>
              <button 
                onClick={exportTrackerCSV}
                disabled={collabs.length === 0}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg text-sm font-bold transition-colors"
              >
                Export Save
              </button>
            </div>
          </div>
          
          <div className="mb-6 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <input 
              type="text"
              placeholder="Search by community name or @username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-inner"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {filteredCollabs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-gray-500 border-2 border-dashed border-gray-800 rounded-xl p-8">
                {collabs.length === 0 ? "Your tracker is empty. Add a collab or import a previously saved CSV file to get started." : "No collabs match your search."}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredCollabs.map((c) => (
                  <div 
                    key={c.id} 
                    className={`border rounded-xl p-4 flex justify-between items-center group relative overflow-hidden transition-all duration-300
                      ${c.isFinished 
                        ? 'bg-gray-950/40 border-gray-800/40 opacity-60' 
                        : 'bg-gray-950 border-gray-800 hover:border-indigo-500/50'
                      }
                    `}
                  >
                    <button 
                      onClick={() => handleCheckboxClick(c)}
                      className={`mr-4 w-6 h-6 rounded-md flex items-center justify-center border transition-colors cursor-pointer shrink-0
                        ${c.isFinished 
                          ? 'bg-green-500 border-green-500 text-white' 
                          : 'bg-gray-900 border-gray-700 hover:border-gray-500'
                        }
                      `}
                    >
                      {c.isFinished && (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                        </svg>
                      )}
                    </button>

                    <div className="z-10 flex-1">
                      <div className={`font-bold text-lg ${c.isFinished ? 'line-through text-gray-500' : ''}`}>
                        {c.name}
                      </div>
                      {c.username && c.username !== "N/A" && (
                        <div className="text-gray-400 text-sm">{c.username}</div>
                      )}
                      {c.isFinished && c.wallets.length > 0 && (
                        <div className="text-indigo-400 text-xs font-bold mt-1 bg-indigo-900/30 px-2 py-1 rounded inline-block">
                          {c.wallets.length} Wallets Secured
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-6 z-10">
                      <div className="text-right">
                        <div className="text-sm text-indigo-400 font-medium">GTD</div>
                        <div className={`font-mono text-xl font-bold ${c.isFinished ? 'text-gray-600' : 'text-white'}`}>
                          {c.gtdSpots}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-sm text-emerald-400 font-medium">FCFS</div>
                        <div className={`font-mono text-xl font-bold ${c.isFinished ? 'text-gray-600' : 'text-white'}`}>
                          {c.fcfsSpots}
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => removeCollab(c.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors p-2 ml-2"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
