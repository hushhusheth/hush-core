import { Note } from "./note";

let firstNote = new Note();
console.log(firstNote.stringify());


let save = firstNote.toSave();
console.log(save);

let recreated = Note.fromSave(save);

console.log(recreated.stringify());