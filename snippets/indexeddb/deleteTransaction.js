const table = 'transactions';
const id = 1;
const indexexDBVersion = 10;
const connection = indexedDB.open('my-portfolio', indexexDBVersion);
console.log(connection);
connection.onsuccess = (e) => {
    const db = e.target.result;
    const trans = db.transaction([table], "readwrite");
    const os = trans.objectStore(table);
    const request = os.delete(id);
    request.onerror = (event) => {
        console.log(`Failed to delete object with id ${id}`);
    }
    request.onsuccess = (event) => {
        console.log("Deleted");
    }
}
