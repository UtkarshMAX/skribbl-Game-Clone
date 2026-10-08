const generateRoomCode = () => {
    const chars =  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let code = "";

    for(let i=0; i<6; i++){
        code += chars[Math.floor(Math.random()*chars.length)];
    }

    return code;
}

export default generateRoomCode;