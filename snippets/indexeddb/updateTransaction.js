const table = 'transactions';
const id = 1;
const indexexDBVersion = 10;
const connection = indexedDB.open('my-portfolio', indexexDBVersion);
console.log(connection);
connection.onsuccess = (e) => {
    const db = e.target.result;
    const trans = db.transaction([table], "readwrite");
    const os = trans.objectStore(table);
    const request = os.get(id);
    request.onerror = (event) => {
        console.log(`Failed to get existing object with id ${id}`);
    }
    request.onsuccess = (event) => {
        const item = event.target.result;
        console.log(item);
        item.date = Date();
        const updateRequest = os.put(item);
        updateRequest.onerror = (event) => {
            console.log("Failed to update object");
        }
        updateRequest.onsuccess = (event) => {
            console.log("updated");
        }
    }
}
