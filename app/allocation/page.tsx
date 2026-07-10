"use client";
import { useState, useMemo } from 'react';

type Community = {
  id: string;
  username: string;
  followers: number;
};

export default function AllocationPage() {
  // Input states
  const [inputTotalSpots, setInputTotalSpots] = useState<number | "">(100);
  const [inputMaxCap, setInputMaxCap] = useState<number | "">("");
  const [inputMinCap, setInputMinCap] = useState<number | "">("");

  // Applied states (used for calculations)
  const [totalSpots, setTotalSpots] = useState<number>(100);
  const [maxCap, setMaxCap] = useState<number | "">("");
  const [minCap, setMinCap] = useState<number | "">("");
  
  const [communities, setCommunities] = useState<Community[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newFollowers, setNewFollowers] = useState<number | "">("");

  const applySettings = () => {
    setTotalSpots(inputTotalSpots === "" ? 1 : inputTotalSpots);
    setMaxCap(inputMaxCap);
    setMinCap(inputMinCap);
  };

  const addCommunity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newFollowers) return;
    
    setCommunities([...communities, {
      id: Math.random().toString(36).substring(7),
      username: newUsername.startsWith('@') ? newUsername : `@${newUsername}`,
      followers: Number(newFollowers)
    }]);
    
    setNewUsername("");
    setNewFollowers("");
  };

  const removeCommunity = (id: string) => {
    setCommunities(communities.filter(c => c.id !== id));
  };

  // Calculate Allocations
  const allocations = useMemo(() => {
    if (communities.length === 0) return [];
    if (totalSpots <= 0) return communities.map(c => ({ ...c, allocated: 0 }));

    let cap = maxCap === "" ? Infinity : Number(maxCap);
    let floor = minCap === "" ? 0 : Number(minCap);
    if (floor > cap) floor = cap; // Sanity check to prevent impossible constraints
    
    // Initialize allocations
    let result = communities.map(c => ({ ...c, allocated: 0, active: true }));
    let unallocated = totalSpots;

    while (unallocated > 0) {
      const activeCommunities = result.filter(c => c.active);
      if (activeCommunities.length === 0) break; // Everyone is locked

      const totalFollowers = activeCommunities.reduce((sum, c) => sum + c.followers, 0);
      if (totalFollowers === 0) break;

      let lockedMaxThisRound = false;
      let lockedMinThisRound = false;

      // Calculate fair share for active communities
      const shares = activeCommunities.map(c => ({
        id: c.id,
        share: (c.followers / totalFollowers) * unallocated,
        followers: c.followers
      }));

      // Phase 1: Check if anyone exceeds the max cap
      for (const item of shares) {
        if (item.share >= cap) {
          const comm = result.find(c => c.id === item.id)!;
          comm.allocated = cap;
          comm.active = false;
          lockedMaxThisRound = true;
          unallocated -= cap;
        }
      }

      // Phase 2: If no max caps were hit (excess trickled down fully), check min caps
      if (!lockedMaxThisRound && floor > 0) {
        const minShares = shares.filter(item => item.share < floor);
        if (minShares.length > 0) {
          // Sort by followers descending to prioritize larger communities if spots run out
          minShares.sort((a, b) => b.followers - a.followers);
          
          for (const item of minShares) {
            const comm = result.find(c => c.id === item.id)!;
            const actualAlloc = Math.min(floor, Math.max(0, unallocated));
            comm.allocated = actualAlloc;
            comm.active = false;
            lockedMinThisRound = true;
            unallocated -= actualAlloc;
          }
        }
      }

      // Phase 3: If no one hit caps, distribute the rest proportionally and finish
      if (!lockedMaxThisRound && !lockedMinThisRound) {
        const floored = shares.map(item => {
          const flooredVal = Math.floor(item.share);
          return { id: item.id, val: flooredVal, remainder: item.share - flooredVal };
        });

        let currentUnallocated = unallocated - floored.reduce((sum, item) => sum + item.val, 0);

        // Sort by remainder descending to distribute the leftovers fairly
        floored.sort((a, b) => b.remainder - a.remainder);

        for (const item of floored) {
          const comm = result.find(c => c.id === item.id)!;
          let finalVal = item.val;
          if (currentUnallocated > 0 && finalVal < cap) {
            finalVal += 1;
            currentUnallocated -= 1;
          }
          comm.allocated = finalVal;
        }
        
        break;
      }
    }

    return result.sort((a, b) => b.followers - a.followers);
  }, [communities, totalSpots, maxCap, minCap]);

  const totalAllocated = allocations.reduce((sum, c) => sum + c.allocated, 0);

  const exportCSV = () => {
    const header = "Username,Followers,Allocated Spots\n";
    const csvRows = allocations.map(c => `${c.username},${c.followers},${c.allocated}`);
    const csvContent = "data:text/csv;charset=utf-8," + header + csvRows.join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "community_allocations.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Community Allocation</h1>
          <p className="text-gray-400 text-lg mt-2 mb-8">
            Distribute whitelist spots proportionally based on the follower reach of your partner communities.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Left Column: Inputs */}
        <div className="flex flex-col gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-6">Global Settings</h2>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Total Whitelist Spots to Distribute</label>
                <input 
                  type="number" 
                  min="1"
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={inputTotalSpots}
                  onChange={(e) => setInputTotalSpots(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Maximum Spots Per Community (Optional)</label>
                <input 
                  type="number" 
                  min="1"
                  placeholder="No limit"
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={inputMaxCap}
                  onChange={(e) => setInputMaxCap(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Minimum Spots Per Community (Optional)</label>
                <input 
                  type="number" 
                  min="1"
                  placeholder="No limit"
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={inputMinCap}
                  onChange={(e) => setInputMinCap(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>

              <button 
                onClick={applySettings}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Apply Settings
              </button>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-6">Add Community</h2>
            <form onSubmit={addCommunity} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">X Username</label>
                <input 
                  type="text" 
                  placeholder="@username" 
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Total Followers</label>
                <input 
                  type="number" 
                  min="1"
                  placeholder="e.g. 15000" 
                  className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newFollowers}
                  onChange={(e) => setNewFollowers(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <button 
                type="submit"
                disabled={!newUsername || !newFollowers}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Add to Calculator
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Results Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col h-[700px]">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold">Allocation Results</h2>
              <div className="text-sm text-gray-400 mt-1">
                {totalAllocated} / {totalSpots} spots allocated
              </div>
            </div>
            
            <button 
              onClick={exportCSV}
              disabled={communities.length === 0}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 px-4 rounded-lg text-sm font-bold transition-colors"
            >
              Export CSV
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {allocations.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
                Add communities to calculate allocations.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {allocations.map((c) => (
                  <div key={c.id} className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex justify-between items-center group relative overflow-hidden">
                    {/* Visual Progress Bar matching their proportion of the total follower pool */}
                    <div 
                      className="absolute left-0 bottom-0 top-0 bg-indigo-500/10 z-0" 
                      style={{ width: `${(c.followers / (allocations.reduce((s, acc) => s + acc.followers, 0) || 1)) * 100}%` }}
                    />
                    
                    <div className="z-10">
                      <div className="font-bold text-lg">{c.username}</div>
                      <div className="text-gray-400 text-sm">{c.followers.toLocaleString()} followers</div>
                    </div>
                    
                    <div className="flex items-center gap-6 z-10">
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Allocated</div>
                        <div className={`font-mono text-2xl font-bold ${c.allocated === maxCap ? 'text-orange-400' : 'text-indigo-400'}`}>
                          {c.allocated}
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => removeCommunity(c.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors"
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
