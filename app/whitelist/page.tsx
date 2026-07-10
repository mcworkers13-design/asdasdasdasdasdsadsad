"use client";
import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

export default function WhitelistPage() {
  const [addresses, setAddresses] = useState<string[]>([]);
  const [newAddress, setNewAddress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addAddress = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAddress = newAddress.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(cleanAddress)) {
      setAddresses([...addresses, cleanAddress]);
      setNewAddress("");
    }
  };

  const removeAddress = (addressToRemove: string) => {
    setAddresses(addresses.filter(a => a !== addressToRemove));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let extractedAddresses: string[] = [];
    const addressRegex = /0x[a-fA-F0-9]{40}/gi; // Case insensitive

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'txt' || extension === 'csv') {
        const text = await file.text();
        const matches = text.match(addressRegex);
        if (matches) {
          extractedAddresses = [...extractedAddresses, ...matches];
        }
      } else if (extension === 'xlsx') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }); // raw: false prevents Hex from becoming float
          const sheetText = JSON.stringify(json);
          const matches = sheetText.match(addressRegex);
          if (matches) {
            extractedAddresses = [...extractedAddresses, ...matches];
          }
        });
      }
    }

    if (extractedAddresses.length > 0) {
      setAddresses(prev => [...prev, ...extractedAddresses]);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const duplicatesCount = addresses.length - new Set(addresses).size;
  const uniqueAddressesCount = new Set(addresses).size;

  const removeDuplicates = () => {
    setAddresses(Array.from(new Set(addresses)));
  };

  const exportCSV = () => {
    // Ensuring we only export unique addresses
    const uniqueAddresses = Array.from(new Set(addresses));
    const header = "Wallet address,Custom mint limit (optional),Custom price in native token e.g. ETH (optional)\n";
    const csvRows = uniqueAddresses.map(address => `${address},,`);
    const csvContent = "data:text/csv;charset=utf-8," + header + csvRows.join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "final_whitelist.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Whitelist Manager</h1>
          <p className="text-gray-400 text-lg mt-2 mb-8">
            Upload multiple files (.txt, .csv, .xlsx), filter out doubles, and export your final whitelist.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col justify-center items-center">
          <div className="text-gray-400 font-medium mb-1">Total Wallets Scanned</div>
          <div className="text-4xl font-bold text-white">{addresses.length}</div>
        </div>
        
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col justify-center items-center relative overflow-hidden">
          {duplicatesCount > 0 && <div className="absolute inset-0 bg-orange-500/10 animate-pulse" />}
          <div className="text-gray-400 font-medium mb-1 z-10">Duplicates Found</div>
          <div className={`text-4xl font-bold z-10 ${duplicatesCount > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
            {duplicatesCount}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col justify-center items-center">
          <div className="text-gray-400 font-medium mb-1">Unique Final Wallets</div>
          <div className="text-4xl font-bold text-green-400">{uniqueAddressesCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4">Upload Files</h2>
            <p className="text-gray-400 text-sm mb-4">
              Select one or multiple files. The system will extract anything that looks like an Ethereum address.
            </p>
            <input
              type="file"
              multiple
              accept=".txt,.csv,.xlsx"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-xl file:border-0
                file:text-sm file:font-semibold
                file:bg-purple-600 file:text-white
                hover:file:bg-purple-700
                cursor-pointer bg-gray-950 border border-gray-800 rounded-xl p-2"
            />
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4">Manual Entry</h2>
            <form onSubmit={addAddress} className="flex gap-4">
              <input 
                type="text" 
                placeholder="Add single address (0x...)" 
                className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
              />
              <button 
                type="submit"
                disabled={!newAddress}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Add
              </button>
            </form>
          </div>
          
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
             <h2 className="text-xl font-bold">Actions</h2>
             <button 
                onClick={removeDuplicates}
                disabled={duplicatesCount === 0}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-xl transition-colors flex justify-center items-center gap-2"
              >
                Remove {duplicatesCount} Doubles
              </button>

              <button 
                onClick={exportCSV}
                disabled={uniqueAddressesCount === 0}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
              >
                Export Final Whitelist (OpenSea Format)
              </button>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Current List Preview</h2>
            <div className="text-sm text-gray-500">{addresses.length} addresses</div>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {addresses.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
                Upload files or add addresses manually to see the list.
              </div>
            ) : (
              <ul className="space-y-2">
                {addresses.map((address, i) => {
                  const isDuplicate = addresses.indexOf(address) !== i;
                  return (
                    <li key={i} className={`flex justify-between items-center p-3 border rounded-xl group transition-colors ${isDuplicate ? 'bg-orange-500/10 border-orange-500/30' : 'bg-gray-950 border-gray-800 hover:border-gray-600'}`}>
                      <span className={`font-mono text-sm ${isDuplicate ? 'text-orange-300' : 'text-gray-300'}`}>
                        {address}
                        {isDuplicate && <span className="ml-2 text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Duplicate</span>}
                      </span>
                      <button 
                        onClick={() => removeAddress(address)}
                        className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300 font-medium text-sm"
                      >
                        Remove
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
