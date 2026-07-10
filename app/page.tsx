"use client";
import { useState, useEffect } from 'react';

import { Alchemy, Network } from 'alchemy-sdk';

const alchemySettings = {
  apiKey: "pyNIqQckWHnP9Um5lTRIH", // User's new Alchemy NFT API Key
  network: Network.ETH_MAINNET,
};
const alchemy = new Alchemy(alchemySettings);

export default function ExportPage() {
  const [contractAddress, setContractAddress] = useState("");
  const [holders, setHolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const fetchHolders = async () => {
    setLoading(true);
    setError("");
    setHolders([]);
    try {
      let addressToFetch = contractAddress.trim();

      // Parse OpenSea URL
      if (addressToFetch.includes('opensea.io/collection/')) {
        const urlParts = addressToFetch.split('opensea.io/collection/');
        const slugStr = urlParts[urlParts.length - 1].split('/')[0].split('?')[0];
        
        // Fetch contract address via our Next.js backend proxy to avoid CORS/browser limits
        const osRes = await fetch(`/api/opensea?slug=${slugStr}`);
        const osData = await osRes.json();
        
        if (!osRes.ok) {
          throw new Error(osData.error || "Failed to fetch collection details from OpenSea");
        }
        
        const primaryContract = osData.contracts?.[0]?.address;
        
        if (!primaryContract) throw new Error("No smart contract found for this collection on Ethereum");
        addressToFetch = primaryContract;
      }

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(addressToFetch)) {
        throw new Error("Invalid Ethereum contract address.");
      }

      // Fetch owners from Alchemy with pagination to get ALL holders
      let allOwners: string[] = [];
      let pageKey: string | undefined = undefined;
      
      do {
        const response: any = await alchemy.nft.getOwnersForContract(addressToFetch, {
          pageKey: pageKey
        });
        
        if (response.owners && response.owners.length > 0) {
          allOwners = [...allOwners, ...response.owners];
        }
        
        pageKey = response.pageKey;
      } while (pageKey);
      
      // Remove duplicates just in case (e.g. someone owns multiple NFTs)
      const uniqueOwners = Array.from(new Set(allOwners));
      
      if (uniqueOwners.length > 0) {
        setHolders(uniqueOwners);
      } else {
        throw new Error("No holders found for this contract. It might not be a valid NFT contract.");
      }

    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
    } finally {
      setLoading(false);
      setCooldown(5); // 5 second cooldown to prevent API spam
    }
  };

  const exportCSV = () => {
    const header = "Wallet address,Custom mint limit (optional),Custom price in native token e.g. ETH (optional)\n";
    const csvRows = holders.map(address => `${address},,`);
    const csvContent = "data:text/csv;charset=utf-8," + header + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "holders_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportTXT = () => {
    const txtContent = "data:text/plain;charset=utf-8," + holders.join("\n");
    const encodedUri = encodeURI(txtContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "holders_export.txt");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <h1 className="text-4xl font-extrabold tracking-tight">Export Holders</h1>
      <p className="text-gray-400 text-lg mb-4">
        Enter an Ethereum contract address or an OpenSea collection URL to fetch all current NFT holders.
      </p>

      <div className="flex gap-4 mb-4">
        <input 
          type="text" 
          placeholder="e.g. 0x... or https://opensea.io/collection/..." 
          className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
        />
        <button 
          onClick={fetchHolders}
          disabled={loading || !contractAddress || cooldown > 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors whitespace-nowrap min-w-[160px]"
        >
          {loading ? "Fetching..." : cooldown > 0 ? `Wait ${cooldown}s` : "Fetch Holders"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl mb-8">
          {error}
        </div>
      )}

      {holders.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Results ({holders.length})</h2>
            <div className="flex gap-2">
              <button 
                onClick={exportTXT}
                className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
              >
                Export to TXT (Notepad)
              </button>
              <button 
                onClick={exportCSV}
                className="bg-gray-800 hover:bg-gray-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
              >
                Export to CSV
              </button>
            </div>
          </div>
          
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-left">
              <thead className="bg-gray-950 border-b border-gray-800">
                <tr>
                  <th className="px-6 py-4 text-gray-400 font-medium">Wallet Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {holders.map((address, i) => (
                  <tr key={i} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm">{address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
